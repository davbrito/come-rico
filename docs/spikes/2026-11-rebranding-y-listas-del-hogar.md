# Spike: rebranding + listas de compra del hogar

> Estado: **borrador para discusión** · Fecha: 2026-11-06 · No es una implementación.
> Producto final esperado: uno o más issues (borradores al final de este documento).

## 0. Resumen

1. **Rebranding**: "ComeRico" puede leerse como albur. El cambio visible al usuario es barato; renombrar el código y la infraestructura es caro y casi no aporta. Propuesta: cambiar todo lo visible ya y dejar los identificadores técnicos para después (o no tocarlos nunca).
2. **El producto cambia de foco**: deja de ser solo "¿qué vamos a comer?" y pasa a ser "¿qué hay que comprar para la casa?". El menú semanal se vuelve **una fuente más** de la lista de compras, junto con los **productos recurrentes** (shampoo, pasta dental…) y los artículos manuales.
3. **Cambios al modelo**: un catálogo `Product` del hogar con intervalo de reposición y `NextDueOn` guardado explícitamente, `ShoppingItem` con `Source` + `ProductId` + `PurchasedAt`, y un comando idempotente que **sincroniza** la lista con todo lo que vence antes del próximo día de compra.
4. **Servidor MCP con autenticación**: lo que más cuesta es *capturar* (productos, platillos, menús). Un agente (Claude en el móvil, en el escritorio o en Claude Code) puede hacerlo por el usuario: "arma el menú de la semana para 4 personas, sin cerdo, con cenas ligeras" o "aquí está la foto del ticket, marca lo que compré". Como toda la lógica ya vive en handlers de MediatR, el MCP es **otro adaptador delgado**, igual que las Minimal APIs. Lo difícil no son las herramientas: es **la autenticación** (OAuth). Decisión: **Amazon Cognito** (free tier) con una lista de correos permitidos, y una capa OAuth delgada (CIMD + DCR) para que Claude se conecte solo con la URL. Los cambios en lote del agente pasan por vista previa y confirmación.

---

## 1. Rebranding

### 1.1 Nombre

"Familist" funciona, pero tiene dos riesgos: mezcla inglés en una app hispanohablante y hay apps con nombres parecidos (FamiList, Familist…). Hay que revisar el dominio, las tiendas de apps y las marcas registradas antes de decidir. Otras opciones con el mismo enfoque de "hogar + lista":

| Nombre | Notas |
| --- | --- |
| **Familist** | Claro y corto. Anglicismo. Revisar si choca con otras apps. |
| **Mandado** / **ElMandado** | En MX, "hacer el mandado" es justo hacer las compras de la casa. Muy local (en otros países se entiende menos). |
| **Despensa** | Describe bien la función, pero es un sustantivo genérico y difícil de registrar. |
| **Alacena** | Igual que "Despensa", con un tono más cálido. |
| **Hogarín** / **Casita** | Amigables. Hablan menos de compras. |

> Decisión pendiente (dueño del producto). El resto del documento usa **Familist** como nombre provisional.

### 1.2 Alcance: tres niveles

**Nivel 1: visible al usuario (recomendado, poco riesgo)**

- `frontend/src/components/Header.tsx`: el logo/texto.
- `frontend/src/routes/__root.tsx`: `<title>`, `og:title` y el lema ("¿Qué vamos a comer?" debería pasar a algo como "La lista de tu casa").
- `frontend/src/routes/index.tsx`: la bienvenida. La landing debe contar la nueva propuesta (lista + menú).
- `frontend/src/lib/og-image.tsx`: el texto y el dominio `come-rico.app`.
- `frontend/public/manifest.json`: `name` y `short_name` (PWA), favicon e íconos si cambia el logo.
- `about.tsx`, `README.md` y los textos de los correos, si los hay.
- **Dominio**: `comerico.davbrito.dev` (`infra/root.hcl` → `base_domain`). Agregar el nuevo dominio y mantener una redirección 301 desde el anterior.

**Nivel 2: identificadores de runtime (con cuidado: rompe las sesiones)**

- Cookie `__Host-comerico.auth` y `AddDataProtection().SetApplicationName("ComeRico")` en `Program.cs`. Si cambia **cualquiera** de los dos, **todos los usuarios pierden la sesión** (el nombre de la aplicación aísla las llaves de Data Protection). No es grave en la etapa actual, pero hay que hacerlo a propósito y en un solo despliegue, o simplemente no cambiarlos: el usuario no los ve.
- Bucket R2 `comerico-storage` y base de datos `comerico`: **no renombrar**. El usuario no los ve y migrarlos cuesta mucho.

**Nivel 3: código e infraestructura (no recomendado por ahora)**

- Namespaces/proyectos `ComeRico.*` (~45 archivos solo en Core, más Api, Infrastructure y Tests), `ComeRico.slnx`, `@comerico/*` en `package.json`, el handler de Lambda `ComeRico.Api`, los workflows de CI, el bucket de tfstate `come-rico-tfstate`, el proyecto de Vercel y el repo `davbrito/come-rico`.
- Un renombrado así genera mucho ruido en los diffs y en el historial, y para el estado de Terraform implica mover recursos con estado (`moved`/import). **Recomendación**: dejarlo como deuda opcional, o hacerlo en un PR mecánico aislado cuando no haya trabajo en paralelo. Los nombres internos no tienen por qué coincidir con la marca.

---

## 2. Cómo funciona hoy (lo relevante)

- `Dish` → `Ingredient` (nombre libre + `Amount` + `MeasurementUnit` cerrado) y `Tag` (N:M).
- `MealPlan` = `Dish` + `DateOnly` + `MealType` (Breakfast/Lunch/Dinner). **No tiene porciones.**
- `ShoppingItem`: es manual o autogenerado (`IsAutoGenerated` + `GeneratedForWeekStart`). Hay **una sola lista plana por hogar**.
- `POST /api/shopping-items/generate`: junta los ingredientes de la semana (de lunes a domingo, fijo) agrupando por nombre normalizado + unidad, y reemplaza los autogenerados de esa semana.

Problemas detectados al revisar:

1. **La regeneración borra los artículos ya comprados**: `GenerateShoppingList` elimina todos los autogenerados de la semana, incluidos los que tienen `IsPurchased == true`. Si regeneras a media semana, pierdes lo que ya marcaste.
2. **La lista crece sin límite**: los artículos comprados nunca salen de la lista. No hay concepto de "terminé la compra" ni historial.
3. **Si no hay ingredientes, falla** (`InvalidOperationException`). Con varias fuentes, una semana sin menú no debería impedir generar la lista.
4. **No hay porciones**: el mismo platillo cuenta igual para 2 personas que para 6, y planificarlo dos veces suma los ingredientes dos veces (eso sí está bien).
5. **La semana empieza siempre en lunes**: no toma en cuenta qué día compra cada familia.
6. Las unidades no se convierten (`500 g` + `1 kg` quedan en renglones separados). Es una limitación conocida; está fuera del alcance de este spike.

---

## 3. Propuesta de modelo

### 3.1 Catálogo de productos del hogar: `Product`

```csharp
public class Product : IHasHousehold
{
    Guid Id; Guid HouseholdId;
    string Name;                 // "Shampoo", "Pasta dental", "Arroz"
    ProductCategory Category;    // Higiene, Limpieza, Despensa, Frescos, Bebés, Mascotas, Otros
    decimal? DefaultAmount;      // 1
    MeasurementUnit? DefaultUnit;// Piece / Package
    int? RestockIntervalDays;    // null = no es recurrente (solo está en el catálogo)
    DateOnly? LastPurchasedOn;
    DateOnly? NextDueOn;         // se guarda explícito (ver abajo)
    bool IsActive;
    DateTime CreatedAt;
}
```

Decisiones y por qué:

- **Guardar `NextDueOn` en lugar de calcularlo**: así existe la acción **"Todavía tengo"** (posponer N días), que en la práctica es indispensable. Los intervalos son estimaciones y la gente necesita corregirlos sin cambiar la configuración. Las reglas:
  - Al comprar: `LastPurchasedOn = hoy` y `NextDueOn = hoy + RestockIntervalDays`.
  - Al posponer: `NextDueOn = hoy + N` (con atajos de +3 días, +1 semana…).
  - Al crear el producto: `NextDueOn = hoy` (entra a la siguiente lista) o una fecha que elija el usuario ("lo compré hace una semana").
- **Intervalo en días** en la base de datos y **atajos en la UI** (cada semana / 2 semanas / mes / 2 meses / personalizado). Es simple y alcanza.
- **`ProductCategory` como enum cerrado** (igual que `MeasurementUnit`). Sirve para agrupar la lista por pasillo o tienda sin tener que modelar varias listas. Se podría pasar a una entidad del hogar más adelante si alguien la pide.
- Agregar **`Package`** (paquete/caja) a `MeasurementUnit`. En los productos de casa "1 pieza" se queda corto.
- *A futuro*: con el historial de `PurchasedAt` (3.2) se puede **sugerir** el intervalo real ("lo compras cada ~24 días"). No es parte del MVP.

### 3.2 `ShoppingItem` con varias fuentes

```csharp
public class ShoppingItem : IHasHousehold
{
    // ...lo que ya existe (Name, Amount, Unit, IsPurchased, CreatedAt)
    ShoppingItemSource Source;      // Manual | MealPlan | Recurring
    Guid? ProductId;                // si viene de (o se vinculó a) un Product
    DateOnly? GeneratedForWeekStart;// solo Source == MealPlan
    DateTime? PurchasedAt;          // reemplaza el bool como fuente de verdad
    DateTime? ArchivedAt;           // "terminé la compra"
}
```

- `IsAutoGenerated` → `Source`. La migración toma `true` como `MealPlan` y `false` como `Manual`.
- Al marcar como comprado un artículo con `ProductId`, se actualiza `Product.LastPurchasedOn/NextDueOn`. **Así se cierra el ciclo.** Si se desmarca el mismo día, se revierte (se guardan los valores anteriores o se recalcula desde el historial).
- Un artículo manual puede pedir **"hacerlo recurrente"**: se crea el `Product` y se vincula. Es la forma más natural de llenar el catálogo.

### 3.3 Sincronizar la lista (un comando, idempotente)

`SyncShoppingListCommand` reemplaza a `GenerateShoppingListCommand`:

1. Calcula la **ventana**: desde hoy hasta el próximo **día de compra** del hogar (nuevo `Household.ShoppingDay : DayOfWeek`, por defecto sábado).
2. **Recurrentes**: los `Product` activos con `NextDueOn <= fin de la ventana` que **no** tengan ya un `ShoppingItem` pendiente (sin comprar y sin archivar) con ese `ProductId` → se crean como `Source = Recurring`.
3. **Menú**: los ingredientes de los `MealPlan` dentro de la ventana, consolidados como hoy. Se reemplazan solo los `MealPlan` **sin comprar**; los comprados se conservan (corrige el problema 1).
4. Si no hay nada que agregar, no falla: la lista se queda igual (corrige el problema 3).

¿Cuándo se ejecuta?

- **MVP**: al abrir `/shopping` (en el loader) y con el botón "Actualizar lista". Es idempotente, así que repetirlo no causa problemas. No requiere jobs ni cambios de infraestructura.
- **Después**: un cron semanal (ya existe el patrón de Vercel Cron + `CRON_SECRET` de `/api/images/cleanup`) que recorre los hogares en su `ShoppingDay - 1` para sincronizar y **notificar** ("Tu lista para mañana tiene 12 cosas"). Solo vale la pena cuando haya notificaciones (push/correo).

### 3.4 Ciclo de vida de la lista

- Acción **"Terminar compra"**: pone `ArchivedAt` en todos los comprados. La lista vuelve a quedar limpia y el historial se guarda (corrige el problema 2).
- Los pendientes no se archivan: pasan a la siguiente compra.
- Vista agrupada por `Category` (y los artículos del menú bajo "Comida de la semana" o en su categoría si están vinculados a un `Product`).
- *Descartado por ahora*: varias listas por hogar (súper / farmacia). La categoría cubre el 90 % del caso con mucha menos complejidad.

### 3.5 Revisar el modelo del menú

Cambios recomendados, en orden de valor:

1. **Porciones**: `Dish.Servings` (rinde para N personas) + `MealPlan.Servings` (para cuántos se cocina, por defecto `Household.DefaultServings`). Al generar la lista: `Amount * MealPlan.Servings / Dish.Servings`.
2. **Ingrediente ↔ Producto (opcional)**: `Ingredient.ProductId?`. Sirve para unificar los nombres ("Arroz" del platillo = "Arroz" de la despensa), sacar la categoría para agrupar y, más adelante, el inventario ("ya tengo arroz"). Se puede hacer **de forma gradual**: al guardar un ingrediente se busca coincidencia por nombre normalizado o se ofrece crear el producto. No es necesario para el MVP de recurrentes.
3. Semana alineada al `ShoppingDay` del hogar en lugar del lunes fijo (esto viene con 3.3).
4. *Fuera del alcance*: entradas libres en el menú ("comemos fuera", "sobras"), conversión de unidades e inventario de despensa.

---

## 4. Acceso para agentes: servidor MCP

### 4.1 Por qué

Lo que más fricción genera es **dar de alta cosas**: platillos con ingredientes, el catálogo de productos y los menús. Con formularios, alguien tiene que escribir cada ingrediente. Un agente con acceso al sistema puede:

- **Planear el menú**: "Menú de lunes a viernes para 4, una comida vegetariana, nada de cerdo, reutiliza los platillos que ya tenemos y crea 2 nuevos". El agente consulta los platillos que existen, crea los que faltan (con ingredientes y porciones), los programa y sincroniza la lista.
- **Procesar el ticket**: el usuario manda la foto de la factura. El agente la lee (la visión del modelo; **el servidor no hace OCR**), consulta la lista pendiente, empata los renglones ("SHAMP H&S 400ML" → "Shampoo"), marca como comprado lo que coincide y **pregunta** antes de hacer algo con lo que no coincide.
- **Arrancar el catálogo**: "Esto es lo que usamos en casa: shampoo cada mes, pasta dental cada 3 semanas…" → creación en lote.
- **Importar recetas**: "Agrega esta receta" (texto o URL) → un platillo con ingredientes normalizados a `MeasurementUnit`.

Así, la UI deja de ser el único camino para capturar datos. Los formularios siguen existiendo, pero el camino rápido es conversacional.

### 4.2 Cómo encaja en la arquitectura

```text
Cliente MCP (claude.ai / app móvil / Desktop / Claude Code)
        │  Streamable HTTP + Authorization: Bearer <token>
        ▼
ComeRico.Api  ── /mcp  (SDK oficial de C#: ModelContextProtocol.AspNetCore)
        │  la herramienta valida los argumentos → IMediator.Send(command)
        ▼
ComeRico.Core handlers (los mismos que usan los endpoints REST)
```

- **Mismo proceso y mismo despliegue** que la API: un `app.MapMcp("/mcp")` más. Las herramientas son clases `[McpServerToolType]` que reciben `IMediator`, así que no hay lógica duplicada y la validación de FluentValidation sigue aplicando.
- **Modo stateless** del transporte HTTP: el backend corre en Lambda (Function URL), así que no se pueden mantener sesiones SSE largas. Ninguna herramienta necesita estado de sesión.
- **Tenancy sin cambios conceptuales**: el token se resuelve en un usuario, de ahí salen sus claims (`household_id`, `household_role`) y `ClaimsTenantService` funciona igual. Solo hay que registrar un segundo esquema de autenticación (bearer) junto a la cookie, con una policy que acepte cualquiera de los dos.

### 4.3 Autenticación: Amazon Cognito + lista de correos permitidos

**Propuesta (del dueño del producto)**: usar **Amazon Cognito** (free tier) como proveedor de identidad, tanto para la web como para el MCP, con una **lista de correos permitidos** que controle quién se puede registrar. Así nadie ajeno consume el free tier.

**Lo que se gana**

- **Un servidor OAuth/OIDC administrado** para el MCP, sin construir uno propio con OpenIddict. Este era el punto más caro de la propuesta anterior.
- Login administrado (Managed Login, con la marca nueva), **recuperación de contraseña y confirmación de correo** (hoy no están implementadas), MFA y login con Google sin código propio.
- Encaja con la infraestructura, que ya está en AWS (Lambda + Terraform).
- Costo: el free tier cubre **10,000 MAU al mes** de inicio de sesión directo o social en los tiers Lite y Essentials. El federado SAML/OIDC solo cubre 50 MAU, pero Google cuenta como "social", no como federado. El tier Plus no tiene free tier: hay que **fijar Essentials o Lite en Terraform**.

**Lista de correos permitidos**

- Un trigger **Pre sign-up** de Cognito (Lambda) rechaza el registro si el correo no está en la lista. El usuario **nunca llega a crearse**, así que no cuenta como MAU.
- El trigger también se dispara con proveedores externos (`PreSignUp_ExternalProvider`). Hay que validar el correo ahí también, o el login con Google se salta la lista.
- **Dónde guardar la lista**: los triggers de Cognito tienen un **timeout de ~5 s**, y conectarse a Neon desde una Lambda fría es arriesgado. Propuesta: **una tabla DynamoDB** `allowed_emails` (PK = correo normalizado en minúsculas), dentro del free tier y **Decisión: solo la administra el admin general** (Terraform/CLI/consola). Más adelante, invitar a alguien al hogar podría escribir en la tabla (requiere permisos IAM de la API sobre esa tabla).
- La alternativa más simple sería desactivar el auto-registro (`AllowAdminCreateUserOnly`) y crear los usuarios a mano. Funciona, pero la experiencia de invitación es peor.

**Cómo encaja con el BFF actual (web)**

- Se mantiene el patrón BFF: el backend es un **cliente OIDC confidencial** de Cognito (authorization code + PKCE). Al volver del login, busca o crea el `AppUser` por `sub` (nueva columna `CognitoSub`, única) y emite **la misma cookie propia** `__Host-…auth` con los claims `household_id` / `household_role`. El resto del sistema (tenancy, policies, `fetchCurrentUser`) no cambia.
- **Decisión: Managed Login de Cognito al inicio.** Las rutas `login`, `register`, `forgot-password` y `reset-password` del frontend se reemplazan por una redirección. Las pantallas propias (issue L) y el login con Google (issue M) quedan como issues aparte.
- ASP.NET Identity queda como modelo de usuario/hogar, sin contraseñas. El password hashing y el `SignInManager` de contraseñas se retiran.
- **Usuarios existentes**: Cognito no puede importar los hashes de Identity. Como hay pocos usuarios, se vinculan por correo en el primer login con Cognito, después de un "restablecer contraseña". La otra opción es un trigger *User migration*, que no vale la pena a esta escala.
- El envío de correo predeterminado de Cognito tiene una cuota diaria baja. Alcanza al principio; si crece, se pasa a SES.

**MCP con Cognito: el hueco que hay que cubrir**

Cognito **no implementa** Dynamic Client Registration, no acepta Client ID Metadata Documents (client IDs como URL) y no publica metadata RFC 8414. Solo publica OIDC discovery. Claude espera DCR o CIMD de forma automática. Opciones:

**Decisión: construir desde el inicio una capa OAuth delgada delante de Cognito** (CIMD + DCR), para que el conector se agregue **solo con la URL** en claude.ai, en la app móvil y en Claude Code, sin copiar client IDs. Así se evitan las fricciones conocidas con client IDs fijos. AWS tiene un ejemplo serverless de este patrón que sirve de referencia.

Diseño propuesto (endpoints en la misma API, para tener un solo despliegue):

| Endpoint | Qué hace |
| --- | --- |
| `/.well-known/oauth-protected-resource` | Metadata del recurso `/mcp` → el authorization server es **nuestra capa**, no Cognito directamente. |
| `/.well-known/oauth-authorization-server` | Metadata RFC 8414: `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, soporte de CIMD, PKCE `S256`, `token_endpoint_auth_methods: none`. |
| `POST /oauth/register` | DCR. **No crea un app client en Cognito por cada registro** (hay cuotas y sería fácil de abusar): emite un `client_id` propio y guarda sus `redirect_uris`. |
| `GET /oauth/authorize` | Valida el cliente: con CIMD descarga el documento de metadata del `client_id` (URL); con DCR busca el registro. Comprueba `redirect_uri`, guarda `state` + `code_challenge` del cliente y redirige a Cognito Managed Login con **un único app client interno** (confidencial) y **nuestro** callback. |
| `GET /oauth/callback` | Recibe el código de Cognito, lo canjea del lado del servidor y emite **un código propio de un solo uso** hacia el `redirect_uri` del cliente. Esto resuelve que Cognito exige callbacks exactos y Claude Code usa puertos de loopback aleatorios. |
| `POST /oauth/token` | Canjea el código propio (verificando el PKCE del cliente) por los tokens de Cognito, y pasa los `refresh_token` a Cognito con el secret del cliente interno. |

- **Los tokens siguen siendo de Cognito**, así que la validación de la API (abajo) no cambia y no emitimos JWT propios.
- **Estado transitorio** (registros DCR, `state`/PKCE pendientes, códigos propios de ~60 s): **DynamoDB con TTL nativo**. Es estado de la capa de autenticación, efímero y de alta rotación, y así no ensucia Postgres. Los registros DCR que no se usen expiran solos.
- **Anti-abuso**: `/oauth/register` es público por especificación, así que lleva rate limiting y solo acepta `redirect_uris` de una lista permitida (callback de claude.ai y loopback `http://127.0.0.1` / `http://localhost`). En CIMD, solo se aceptan hosts de `client_id` de confianza (claude.ai, …). De todas formas, nadie obtiene tokens sin un usuario de Cognito, y para eso necesita estar en la lista de correos.
- Hay que verificar el comportamiento exacto de los clientes de Claude (cuándo usan CIMD o DCR, y qué campos de metadata exigen) contra la documentación vigente de conectores cuando se tome el issue.

Validación del token en la API: `AddJwtBearer` con `Authority` = issuer del user pool. Los access tokens de Cognito **no traen `aud`**, así que se valida `token_use == "access"` y que `client_id` esté en la lista de app clients permitidos. Un `IClaimsTransformation` mapea `sub` → `AppUser` → claims del hogar (con caché corta), y `ClaimsTenantService` funciona sin cambios. Los scopes `read` / `write` se definen como *custom scopes* de un resource server en Cognito.

Reglas comunes:

- El token pertenece a un **usuario** (no al hogar), así que hereda su hogar y su rol. Si el usuario sale del hogar, el token deja de servir para ese hogar.
- Scopes: `read` y `write`. Las herramientas destructivas exigen `write` y, además, una confirmación del usuario dentro del cliente (`destructiveHint`).
- **Auditoría**: guardar `CreatedByUserId` y `Origin` (`Web` / `Agent`) en lo que crea o modifica el agente, para que la UI muestre "agregado por el asistente" y se pueda deshacer.
- Rate limiting por token (`AddRateLimiter` de ASP.NET Core).

### 4.4 Diseño de las herramientas

Hay que pensarlas **para un agente, no como un espejo del CRUD REST**: pocas llamadas, operaciones en lote, búsqueda por nombre y resultados compactos.

| Herramienta | Tipo | Notas |
| --- | --- | --- |
| `get_household_context` | lectura | Personas, porciones por defecto, día de compra, categorías y unidades válidas. Es la primera llamada de cualquier flujo. |
| `search_dishes` | lectura | Por nombre, etiqueta o ingrediente. Devuelve ingredientes resumidos. |
| `get_meal_plan` | lectura | Rango de fechas. |
| `get_shopping_list` | lectura | Pendientes por defecto, agrupados por categoría, con `id`, `source` y `productId`. |
| `list_products` | lectura | Incluye `nextDueOn`. |
| `create_dishes` | escritura | **En lote**: platillos con ingredientes, etiquetas (se crean si no existen) y porciones, en una sola llamada. |
| `plan_meals` | escritura | En lote: `[{date, mealType, dishId, servings}]`. Pasa por vista previa y confirmación (4.4.1). |
| `upsert_products` | escritura | En lote, con intervalo y última compra. |
| `add_shopping_items` | escritura | En lote. |
| `mark_items_purchased` | escritura | En lote, por `ids` + `purchasedAt` opcional (la fecha del ticket). Es reversible. |
| `postpone_product` | escritura | El "todavía tengo". |
| `sync_shopping_list` | escritura | Idempotente (3.3). |

- **El empate del ticket lo hace el modelo**, no el servidor: `get_shopping_list` le da los candidatos y él decide. Un `match_shopping_items(names[])` del lado del servidor (normalización + similitud) sería una optimización posterior, solo si el empate del modelo resulta poco confiable.
- **Prompts MCP** como atajos: `planear_menu_semanal(personas, restricciones, dias)` y `procesar_ticket`. Ofrecen el flujo guiado sin que el usuario tenga que redactar todo.
- **Fuera de v1**: borrar platillos o productos desde el agente (menos riesgo). Se agrega con `destructiveHint` cuando haga falta.
- Los mensajes de error deben servirle al agente para corregirse ("unidad `pz` no válida; usa una de: Piece, Gram, …"). Los validadores actuales ya dan mensajes claros en español.

### 4.4.1 Vista previa y confirmación de cambios en lote

**Decisión**: cuando el agente crea muchas cosas a la vez, primero hay una vista previa y después una confirmación.

Flujo:

1. Las herramientas de creación en lote (`create_dishes`, `plan_meals`, `upsert_products`, y `add_shopping_items` con más de N elementos) **no aplican nada**: validan, resuelven nombres → ids, y guardan una **operación pendiente**. Devuelven `{ operationId, preview, expiresAt }`. El `preview` es un resumen legible ("3 platillos nuevos, 10 comidas programadas, 24 ingredientes a la lista").
2. El agente muestra la vista previa. El usuario ajusta ("cambia el jueves por pescado"), y el agente **descarta y vuelve a proponer**; no se edita la operación.
3. `confirm_operation(operationId)` la aplica **en una sola transacción**, **revalidando** (algo pudo cambiar entre la propuesta y la confirmación). Es idempotente: confirmar dos veces devuelve el mismo resultado. `cancel_operation` la descarta.
4. Solo puede confirmarla **el mismo usuario** que la propuso, dentro de su hogar. Expira en ~30 min.
5. *Después*: un enlace `/aprobar/{operationId}` para revisar y aprobar desde la web, desmarcando renglones. Así la confirmación no depende de lo que el agente diga que dijo el usuario.

Las operaciones pequeñas y reversibles (`mark_items_purchased`, `postpone_product`, agregar 1 o 2 artículos) **se aplican directo** y devuelven un resumen con la opción de deshacer. Con el ticket, el agente ya muestra el empate en el chat, y obligar a confirmar dos veces cada compra sería fricción.

**¿DynamoDB para las operaciones pendientes?** Opinión: **mejor Postgres** (`PendingOperation : IHasHousehold`, con payload `jsonb`, `PayloadHash`, `Status`, `CreatedByUserId`, `ExpiresAt`):

- **Tenancy gratis**: el filtro global por `IHasHousehold` ya impide que otro hogar vea o confirme la operación. En DynamoDB habría que reimplementarlo a mano.
- **Mismo modelo y mismas pruebas**: se aplica con los mismos handlers y EF, y se prueba con EF InMemory como el resto. DynamoDB metería el SDK de AWS, permisos IAM y un emulador local (DynamoDB Local) en el camino de las peticiones de la API.
- La ventaja de DynamoDB (TTL nativo) se cubre con un filtro `ExpiresAt > now` y una limpieza en el cron semanal que ya existe (`/api/images/cleanup`, o uno hermano).

**Regla propuesta**: **DynamoDB para lo que vive en la capa de autenticación** (lista de correos, que lee el trigger de Cognito; estado transitorio de la capa OAuth) y **Postgres para todo lo del dominio**, incluidas las operaciones pendientes. Así cada almacén tiene un propósito claro.

*Alternativa futura*: la **elicitation** de MCP (el servidor le pide confirmación al usuario directamente en la UI del cliente) evitaría depender del agente, pero el soporte en los clientes es desigual. Conviene revisarla más adelante.

### 4.5 Dependencias y orden

- El MCP **no depende** del catálogo de productos para arrancar: v1 puede exponer platillos, menú y lista. Pero el caso del ticket brilla de verdad con C (`PurchasedAt` + recurrentes que se recalculan), y crear platillos para N personas necesita E (porciones).
- Por eso **E (porciones) sube de prioridad**: sin porciones, "menú para 4 personas" no se traduce en cantidades correctas.
- Las herramientas de productos se agregan cuando llegue B.

---

## 5. Preguntas abiertas (para decidir juntos)

1. **Nombre final** y si se compra dominio propio.
2. ¿Los recurrentes vencidos **entran directo** a la lista (propuesta) o aparecen como **sugerencias** que hay que confirmar? La propuesta es que entren directo, en su propia sección, con "Todavía tengo" a un toque.
3. ¿Quién configura el catálogo: cualquier miembro o solo Admin? La propuesta es cualquier miembro, porque se parece a la lista misma.
4. ¿El "día de compra" es por hogar (propuesta) o hay hogares que compran varias veces por semana? En ese caso, la ventana podría ser "próximos 7 días" en lugar de "hasta el día de compra".
5. ¿Hacemos el rebranding del nivel 2 (cookie/Data Protection) ahora, aprovechando que hay pocos usuarios, o nunca?

### Decisiones tomadas

- **Autenticación**: Amazon Cognito (free tier, tier Essentials o Lite), con **Managed Login** al inicio. Pantallas propias → issue L. Login con Google → issue M.
- **Lista de correos permitidos**: la administra solo el admin general (DynamoDB vía Terraform/CLI).
- **MCP**: capa CIMD + DCR delante de Cognito **desde el inicio** (issue K, requisito del MCP).
- **Cambios en lote del agente**: vista previa y confirmación (4.4.1). Operaciones pendientes en Postgres (pendiente de confirmar: se había propuesto DynamoDB).

---

## 6. Issues propuestos

Orden sugerido: **A** (independiente) · **B → C → D** · **E** (antes de que el MCP planee menús) · **J → K → I** (Cognito → capa OAuth → MCP) en paralelo con B/C. F/G/H/L/M después.

### A. Rebranding visible: ComeRico → {nombre}
- Decidir el nombre (sección 1.1) y conseguir el dominio.
- Cambiar los textos, el título, OG, el manifest, el header, la landing (nueva propuesta: lista + menú), el README y los íconos.
- Configurar el dominio nuevo en Vercel/infra con un 301 desde `comerico.davbrito.dev`.
- **Fuera del alcance**: namespaces, cookie, buckets, base de datos y repo.

### B. Catálogo de productos del hogar con intervalo de reposición
- Entidad `Product` (3.1), `ProductCategory`, `MeasurementUnit.Package` y la migración.
- CRUD `/api/products` y la página "Productos del hogar" (nombre, categoría, cantidad por defecto, "cada cuánto", última compra).
- Pruebas: filtro por hogar y cálculo de `NextDueOn`.

### C. Lista de compras unificada: recurrentes + menú + manuales
- `ShoppingItem.Source`, `ProductId`, `PurchasedAt` y la migración desde `IsAutoGenerated`.
- `Household.ShoppingDay`.
- `SyncShoppingListCommand` (3.3), que reemplaza a `generate`. Sincroniza al abrir la lista y con el botón.
- Marcar como comprado actualiza el `Product`. Acción "Todavía tengo" (posponer).
- Acción "Hacer recurrente" desde un artículo manual.
- **Corrige**: la regeneración borra comprados, y falla cuando no hay ingredientes.
- Pruebas: idempotencia, que no haya duplicados y que se conserven los comprados.

### D. Ciclo de vida de la lista: "Terminar compra" e historial
- `ArchivedAt`, la acción "Terminar compra" y la vista agrupada por categoría.

### E. Porciones en platillos y en el menú
- `Dish.Servings`, `MealPlan.Servings`, `Household.DefaultServings` y el escalado al generar la lista.

### F. (Opcional) Vincular ingredientes con productos
- `Ingredient.ProductId?`, coincidencias por nombre y sugerencias en la UI.

### G. (Futuro) Recordatorio semanal
- Cron por hogar en `ShoppingDay - 1` + notificación. Depende de tener un canal de notificaciones.

### J. Migrar la autenticación a Amazon Cognito con lista de correos permitidos
- User pool (tier Essentials o Lite, fijado en Terraform), **Managed Login** con la marca nueva y app client confidencial para el BFF.
- Trigger Pre sign-up + tabla DynamoDB `allowed_emails`, administrada solo por el admin general. El trigger ya contempla `PreSignUp_ExternalProvider` para cuando llegue M.
- Backend: login OIDC → `AppUser` por `CognitoSub` → la misma cookie propia con claims del hogar. Retirar contraseñas de Identity.
- Frontend: reemplazar login/registro/recuperación por la redirección.
- Migración de los usuarios existentes (vinculación por correo).
- Pruebas: un correo no permitido no puede registrarse, y la sesión y la tenancy siguen igual.

### K. Capa OAuth (CIMD + DCR) delante de Cognito
- Endpoints de 4.3: metadata RFC 9728/8414, `/oauth/register`, `/oauth/authorize`, `/oauth/callback` y `/oauth/token`. Un único app client interno de Cognito.
- Estado transitorio en DynamoDB con TTL (registros, `state`/PKCE, códigos propios).
- Anti-abuso: rate limiting, lista permitida de `redirect_uris` y de hosts CIMD.
- Criterio de aceptación: agregar el conector **solo con la URL** en claude.ai (web y móvil) y en Claude Code, y obtener un access token de Cognito válido para `/mcp`.

### I. Servidor MCP v1 (depende de J y K)
- Endpoint `/mcp` (SDK de C#, Streamable HTTP stateless) en `ComeRico.Api`.
- Validación de access tokens de Cognito: JwtBearer, `token_use` / `client_id`, custom scopes `read` / `write` y `IClaimsTransformation` `sub` → hogar.
- Herramientas de 4.4 para platillos, menú y lista (las de productos llegan con B), más los prompts `planear_menu_semanal` y `procesar_ticket`.
- **Vista previa y confirmación** para cambios en lote (4.4.1): `PendingOperation`, `confirm_operation` y `cancel_operation`, con revalidación al confirmar.
- Auditoría `Origin = Agent` y rate limiting.
- Criterio de aceptación: el flujo del menú semanal (con vista previa) y el del ticket desde el móvil.
- Pruebas: aislamiento por hogar con bearer, scopes, que un usuario no pueda confirmar operaciones de otro hogar o de otro usuario, idempotencia de la confirmación, y que cada herramienta mande el comando correcto.

### L. Pantallas de login propias sobre Cognito
- Reemplazar Managed Login por pantallas propias (login, registro, recuperación) con la API de Cognito, si la experiencia de Managed Login se queda corta.

### M. Login con Google
- Google como proveedor social en el user pool, con el botón en el login y la lista de correos aplicada vía `PreSignUp_ExternalProvider`.
- Probar el caso de un correo ya registrado con contraseña que entra con Google: vincular cuentas (`AdminLinkProviderForUser`) en lugar de duplicarlas.

### H. (Opcional, deuda) Rebranding técnico
- Namespaces `ComeRico.*`, paquetes `@comerico/*`, cookie/Data Protection (cierra todas las sesiones), recursos de infraestructura con `moved`. Un PR mecánico aislado.
