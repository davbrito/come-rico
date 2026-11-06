# Spike: rebranding + listas de compra del hogar

> Estado: **borrador para discusión** · Fecha: 2026-11-06 · No es una implementación.
> Producto final esperado: uno o más issues (borradores al final de este documento).

## 0. Resumen

1. **Rebranding**: "ComeRico" puede leerse como albur. El cambio visible al usuario es barato; renombrar el código y la infraestructura es caro y casi no aporta. Propuesta: cambiar todo lo visible ya y dejar los identificadores técnicos para después (o no tocarlos nunca).
2. **El producto cambia de foco**: deja de ser solo "¿qué vamos a comer?" y pasa a ser "¿qué hay que comprar para la casa?". El menú semanal se vuelve **una fuente más** de la lista de compras, junto con los **productos recurrentes** (shampoo, pasta dental…) y los artículos manuales.
3. **Cambios al modelo**: un catálogo `Product` del hogar que aparece en la lista cuando **ya pasó t desde la última compra o se marcó como agotado**, `ShoppingItem` con `Source` + `ProductId` + `PurchasedAt`, y un comando idempotente que **sincroniza** la lista con todo lo que vence antes del próximo día de compra.
4. **Servidor MCP con autenticación**: lo que más cuesta es *capturar* (productos, platillos, menús). Un agente (Claude en el móvil, en el escritorio o en Claude Code) puede hacerlo por el usuario: "arma el menú de la semana para 4 personas, sin cerdo, con cenas ligeras" o "aquí está la foto del ticket, marca lo que compré". Como toda la lógica ya vive en handlers de MediatR, el MCP es **otro adaptador delgado**, igual que las Minimal APIs. Lo difícil no son las herramientas: es **la autenticación** (OAuth). Decisión: **Amazon Cognito** (free tier) con invitaciones firmadas, y una capa OAuth delgada (CIMD + DCR) para que Claude se conecte solo con la URL. Los cambios en lote del agente pasan por vista previa y confirmación.

---

## 1. Rebranding

### 1.1 Nombre

**Corrección**: en una búsqueda rápida en tiendas de apps **no aparece "Familist" tal cual**, pero sí **"FamyList"** (lista de compras familiar compartida, en la App Store) y varias "Family List" / "Family Shopping List". FamyList se pronuncia igual que Familist y es exactamente la misma categoría, así que el problema no es que el nombre esté tomado: es que se confundiría con esa app. Antes de decidir cualquier nombre hay que revisar el dominio, las tiendas de apps y las marcas registradas (IMPI en MX, o la oficina del país donde se lance).

Criterios para la lista corta:

1. **Sin doble sentido** (es la razón del rebranding). Evitar palabras de comida y verbos con uso de albur en MX: "comer", "surtir"/"surtido", "pepino", "chile", "camote"…
2. **Habla del hogar y de reponer**, no solo de cocinar: el producto ahora es "lo que hace falta en casa", y el menú es una fuente más.
3. Corto, fácil de pronunciar y de escribir en un dominio.

| Nombre | A favor | En contra | Búsqueda rápida |
| --- | --- | --- | --- |
| **Despi** (de *despensa*) | Corto (5 letras), amigable, fácil de pronunciar y de escribir en un dominio. Se entiende en toda Latinoamérica y España. Da para mascota/ícono. Guiño a "despistado": la app recuerda por ti. | Viene de *despensa* (lo que hay en casa), así que cubre poco el menú; se resuelve con el lema. Existe **Despia** (herramienta para convertir web apps en apps nativas): distinta categoría, pero parecida al escribir. | No apareció una app ni una marca de despensa llamada "Despi". |
| **Alacena** | Cálido, claro, en español neutro. "Lo que hay (y falta) en casa". | Sustantivo común: difícil de registrar como marca y de encontrar en buscadores. | No apareció una app con ese nombre. |
| **Repón** | Es justo la función nueva (reponer lo que se acaba). Verbo corto, con personalidad. | El acento complica el dominio (`repon.app`). Habla poco del menú. | No apareció. |
| **Casa Lista** | Doble lectura positiva: "la lista de la casa" / "la casa lista". Cubre lista y menú. | Dos palabras. Más descriptivo que memorable. | No apareció. |
| **Mandado** | En MX es literal: "hacer el mandado" = las compras de la casa. | Muy local. Existe "El Mandado App" (pedidos/entregas), parecido aunque de otra categoría. | Existe "El Mandado App". |
| **Despensa** | Muy claro. | Muy genérico; hay muchas apps de "despensa". | Muchas apps con la palabra. |
| **Canasta** | "Canasta básica" se entiende en toda Latinoamérica. | Suena a supermercado, no a hogar; puede leerse como tienda. | Sin revisar. |
| **Familist** | Corto, en la idea original. | Anglicismo, y se confunde con **FamyList**. | FamyList existe. |

**Revisión de dominios (2026-11-06, vía RDAP y DNS; "libre" = sin registro/NS visible, hay que confirmarlo con un registrador):**

| Nombre | Dominios | Hallazgo |
| --- | --- | --- |
| **Despi** | `despi.com` (desde 2002), `despi.app` (desde 05/2026), `despi.com.mx`, `despi.co`, `despi.net` y `despi.org`: **tomados**. `despi.mx`, `despi.io`, `getdespi.com`, `holadespi.com` y `despiapp.com`: libres. | **Descartado.** `despi.com.mx` es **"Despi — ¿qué hago de comer?"**, una app mexicana en lista de espera que lee la foto del ticket, llena la despensa, sugiere recetas y reparte porciones por persona. Mismo nombre, mismo país, misma categoría y casi las mismas funciones: confusión segura y riesgo de marca. |
| **Alacena** | `alacena.app`, `alacena.mx` y `alacena.com.mx`: tomados. | `alacena.mx` es un grupo de marcas gastronómicas (eventos) en Guadalajara. Mismo rubro (comida): mal candidato. |
| **Casa Lista** | `casalista.mx`, `casalista.app` y `casalista.com.mx`: tomados. `casalista.com`: libre. | `casalista.mx` es un portal inmobiliario en CDMX. Otra categoría, pero dominio `.mx` ocupado. |
| **Repón** | `repon.app`, `repon.mx` y `repon.com.mx`: **libres**. `repon.com`: tomado. | No se encontró producto con ese nombre. **Mejor disponibilidad de la lista.** |
| Restocapp | `restocapp.com`, `restoc.app` y `restock.app`: tomados. `restocapp.app`, `.mx` y `.com.mx`: libres. | **Descartado.** `restocapp.com` es **"Restoc: Know before you run out"** (alertas de reorden para tiendas Shopify): mismo concepto y casi el mismo nombre. `restoc.app` es otra app de alertas de stock para Shopify. Además es anglicismo y lleva "app" dentro del nombre. |
| Nos Falta | `nosfalta.app`, `.mx`, `.com.mx` y `.com`: **todos libres**. | No se encontró producto. Frase natural en el hogar ("¿qué nos falta?"). |
| Se Acabó | `seacabo.app`, `.mx` y `.com.mx`: libres. `.com`: tomado. | Encaja con "marcar agotado". Tono más de alerta que de hogar. |
| Qué Falta / Falta | `.mx` y `.com.mx`: libres. `.app` y `.com`: tomados. | **Evitar**: `quefalta.app` ya es una app de lista de compras. |

Redes sociales: no se pudieron verificar automáticamente (Instagram, TikTok y X piden sesión; la API de GitHub está restringida en este entorno). Hay que revisarlas a mano para el nombre elegido.

**Forma del nombre** (aplica a cualquier nombre elegido): la marca es solo el nombre, sin "App". "App" solo se usa donde haga falta desambiguar (dominio o redes ocupados), y en las tiendas de apps el título lleva un descriptor de búsqueda (p. ej. "{Marca}: lista de compras de casa").

> Decisión pendiente (dueño del producto). El resto del documento usa **{marca}** como nombre provisional.

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

- Cookie `__Host-comerico.auth` y `AddDataProtection().SetApplicationName("ComeRico")` en `Program.cs`. Si cambia **cualquiera** de los dos, **todos los usuarios pierden la sesión** (el nombre de la aplicación aísla las llaves de Data Protection). **Decisión: se cambian ya** (no hay usuarios en producción), en el issue A. De todas formas la migración a Cognito (J) emite sesiones nuevas.
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
    int? RestockIntervalDays;    // t = lo que dura DefaultAmount; null = sin recurrencia (solo si se marca agotado)
    string? PreferredBrand;      // "Colgate"; se muestra en la lista, opcional
    DateOnly? LastPurchasedOn;
    decimal? LastPurchasedAmount;// cache del último evento Purchased: para escalar t por cantidad
    MeasurementUnit? LastPurchasedUnit;
    DateTime? OutOfStockAt;      // "se acabó"; se limpia al comprar
    DateOnly? SnoozedUntil;      // "todavía tengo"; solo afecta a la regla de tiempo
    bool IsActive;
    DateTime CreatedAt;
}
```

**Regla de aparición en la lista (decisión)**: un producto aparece en la lista si se cumple **cualquiera** de estas dos condiciones:

1. **Ya pasó t desde la última compra**: `fechaReferencia >= LastPurchasedOn + t_efectivo`, salvo que esté pospuesto (`fechaReferencia < SnoozedUntil`).
2. **Se marcó como agotado**: `OutOfStockAt != null`. Esta gana siempre, incluso si está pospuesto o no tiene intervalo.

```text
fechaReferencia = Household.ShoppingDay != null ? próximoDíaDeCompra : hoy
t_efectivo      = LastPurchasedUnit == DefaultUnit ? t * (LastPurchasedAmount / DefaultAmount) : t
debeAparecer    = OutOfStockAt != null
               || (t != null && fechaReferencia >= max(LastPurchasedOn + t_efectivo, SnoozedUntil ?? min))
porVencer       = !debeAparecer && t != null && hoy + 7 >= LastPurchasedOn + t_efectivo
```

- **Con día de compra** (opcional, `Household.ShoppingDay : DayOfWeek?`): se **anticipa** contra el próximo día de compra, así que lo que vence el martes entra en la compra del sábado anterior.
- **Sin día de compra**: se evalúa contra **hoy** y la lista muestra una sección **"Por vencer (próximos 7 días)"** con lo que está por tocar, para quien quiera adelantarse.
- **t escala con la cantidad comprada**: t es "lo que dura la cantidad por defecto". Si el papel de baño es "1 paquete cada 2 semanas" y compraste 2, vuelve a aparecer en 4 semanas. No hace falta un campo de "unidades por intervalo": sale de la cantidad por defecto y de la cantidad comprada.

**Dónde vive el "2" (el recorrido completo)**:

1. **Producto**: `DefaultAmount = 1`, `DefaultUnit = Package`, `t = 14 días`.
2. **Al entrar a la lista**, el `ShoppingItem` se crea con `Amount = 1`, `Unit = Package` (columnas que **ya existen** en `ShoppingItem`).
3. **Al comprar**, la cantidad se puede ajustar: se edita el renglón a 2, o el agente lee "x2" en el ticket. `SetShoppingItemPurchased` (hoy solo recibe el bool) pasa a aceptar `amount?` y `unit?` opcionales. Por defecto toma los del renglón.
4. **Se registra** `ProductPurchased { Amount = 2, Unit = Package }`: es la **fuente de verdad**.
5. **Se actualiza el cache** en el producto: `LastPurchasedOn`, `LastPurchasedAmount = 2`, `LastPurchasedUnit = Package`. Es lo que lee la regla, para no consultar el log en cada sincronización. Si el cache se corrompe, se recalcula desde el último `Purchased` vigente.
6. **La regla** calcula `t_efectivo = 14 × 2/1 = 28 días`. Si la unidad comprada no coincide con la por defecto (500 ml contra "1 pieza"), no hay conversión de unidades y se usa t sin escalar.

*Caso borde: comprar de nuevo antes de que toque.* Con la regla anterior, una compra nueva **reinicia** el conteo desde esa fecha y se pierde lo que quedaba. Es aceptable para el MVP: es la estimación conservadora, y en el peor caso aparece antes de tiempo, donde "Todavía tengo" lo corrige. La alternativa de **acumular** cobertura (`cubiertoHasta = max(cubiertoHasta, compra) + t_efectivo`) es más precisa, pero introduce un campo derivado que habría que recalcular desde el log cuando cambia t. Se deja para cuando exista la sugerencia de intervalo.

Por qué funciona bien:

- **El tiempo es una estimación y "agotado" es la señal real.** El intervalo cubre lo que la gente olvida revisar, y "agotado" cubre lo que se acabó antes de lo previsto. Juntas evitan los dos fallos típicos: quedarse sin algo y comprar algo que todavía hay.
- **Unifica el catálogo**: un producto **sin** intervalo (p. ej. "pilas", "foco") también sirve. Solo aparece cuando alguien lo marca agotado. El intervalo pasa a ser opcional.
- **Se calcula en vez de guardar `NextDueOn`**: si alguien cambia t, la próxima fecha se recalcula sola y no queda un campo derivado desactualizado. "Todavía tengo" se expresa con `SnoozedUntil`.
- **Es lo ideal para el agente y para la UI rápida**: "se acabó el shampoo" es una sola acción (botón en el catálogo o la herramienta MCP `mark_out_of_stock`). Marcar agotado **agrega el artículo a la lista en el momento**, sin esperar a la sincronización.

Transiciones:

| Evento | Efecto |
| --- | --- |
| Comprar (marcar comprado un artículo con `ProductId`) | Evento `Purchased` (cantidad + unidad), `LastPurchasedOn/Amount/Unit` del evento, `OutOfStockAt = null`, `SnoozedUntil = null` |
| Marcar agotado | `OutOfStockAt = ahora` y crear el `ShoppingItem` si no hay uno pendiente |
| "Todavía tengo" (+N días) | `SnoozedUntil = hoy + N` y quitar el artículo pendiente si vino por tiempo. **No aplica si está agotado**: sería contradictorio |
| Desmarcar comprado | Revertir a los valores anteriores (se guardan en el `ShoppingItem` al marcarlo) |
| Crear producto | Preguntar "¿cuándo lo compraste por última vez?". Si no se sabe, `LastPurchasedOn = null`, que cuenta como vencido y entra a la siguiente lista |

**Decidido**: anticipar contra el día de compra si existe; si no, contra hoy, con la sección "Por vencer".

- **Intervalo en días** en la base de datos y **atajos en la UI** (cada semana / 2 semanas / mes / 2 meses / personalizado). Es simple y alcanza.
- **`ProductCategory` como enum cerrado** (igual que `MeasurementUnit`). Sirve para agrupar la lista por pasillo o tienda sin tener que modelar varias listas. Se podría pasar a una entidad del hogar más adelante si alguien la pide.
- Agregar **`Package`** (paquete/caja) a `MeasurementUnit`. En los productos de casa "1 pieza" se queda corto.

### 3.1.1 Historial de eventos (`ProductEvent`) y qué datos guardar de cada compra

**Decisión**: llevar un log de eventos desde el MVP. Es **append-only** (nunca se edita; una corrección es otro evento) y se escribe **en la misma transacción** que el cambio de estado.

**El log es polimórfico: cada tipo de evento trae datos distintos. ¿Cómo modelarlo?**

| Opción | Cómo es | Veredicto |
| --- | --- | --- |
| Una clase con todas las columnas nulas | Una sola entidad, con `TotalPrice`, `SnoozeDays`… todos nulos según el tipo | Fácil, pero el código permite combinaciones inválidas (un `Snoozed` con precio) y cada consumidor tiene que saber qué campos aplican a cada tipo. |
| **TPH (una tabla, jerarquía de clases)** | Clase base abstracta + una subclase por evento; EF guarda todo en **una tabla** con un discriminador | **Recomendado.** |
| Tabla base + `jsonb` con el payload | Columnas comunes + un `Data jsonb` polimórfico | Flexible, pero los reportes de gasto tendrían que consultar dentro del JSON, y EF no traduce bien LINQ sobre JSON polimórfico. Además se pierden las restricciones de la base de datos. |
| TPT / TPC (una tabla por tipo) | Joins o uniones en cada consulta del historial | Demasiado para 5 tipos de evento con 1 o 2 campos cada uno. |

**Diseño con TPH**:

```csharp
public abstract class ProductEvent : IHasHousehold
{
    public Guid Id { get; private set; }
    public Guid HouseholdId { get; private set; }
    public Guid ProductId { get; private set; }
    public DateTime OccurredAt { get; private set; }   // cuándo pasó (fecha del ticket si viene de uno)
    public DateTime RecordedAt { get; private set; }   // cuándo se registró
    public Guid UserId { get; private set; }
    public EventOrigin Origin { get; private set; }    // Web | Agent
}

public sealed class ProductPurchased : ProductEvent
{
    public Guid? ShoppingItemId { get; private set; }
    public decimal Amount { get; private set; }        // obligatorio en el tipo
    public MeasurementUnit Unit { get; private set; }
    public Money? Price { get; private set; }          // owned/complex type: TotalPrice + Currency, juntos o ninguno
    public string? Brand { get; private set; }
    public string? Store { get; private set; }
    public string? ReceiptLineText { get; private set; }
}

public sealed class ProductPurchaseReverted : ProductEvent { public Guid PurchaseEventId { get; private set; } }
public sealed class ProductMarkedOutOfStock : ProductEvent { }
public sealed class ProductSnoozed : ProductEvent { public int Days { get; private set; } }
public sealed class ProductIntervalChanged : ProductEvent { public int? OldDays { get; private set; } public int? NewDays { get; private set; } }

public sealed record Money(decimal Amount, string Currency); // numeric(12,2) + char(3)
```

```csharp
// Configuración EF
b.Entity<ProductEvent>(e =>
{
    e.ToTable("ProductEvents");
    e.HasDiscriminator<string>("Type")
        .HasValue<ProductPurchased>("Purchased")
        .HasValue<ProductPurchaseReverted>("PurchaseReverted")
        .HasValue<ProductMarkedOutOfStock>("OutOfStock")
        .HasValue<ProductSnoozed>("Snoozed")
        .HasValue<ProductIntervalChanged>("IntervalChanged");
    e.HasIndex(x => new { x.HouseholdId, x.ProductId, x.OccurredAt });
});
b.Entity<ProductPurchased>().ComplexProperty(x => x.Price); // o OwnsOne
// + check constraints por tipo, p. ej.: Type <> 'Purchased' OR "Amount" IS NOT NULL
```

Por qué TPH:

- **En el código, cada evento solo tiene sus campos.** No se puede crear un `ProductSnoozed` con precio, y los factory methods validan cada caso. En la tabla, las columnas de cada subtipo son nulas para los demás, y unos **check constraints** por `Type` cuidan la integridad en la base de datos.
- **Consultas tipadas y traducibles a SQL**: `db.ProductEvents.OfType<ProductPurchased>().Where(p => p.Price != null).GroupBy(p => p.Price!.Currency)…` para el gasto, o `OrderByDescending(OccurredAt)` sobre la base para el historial completo de un producto.
- **Una sola tabla y un solo índice** (`HouseholdId, ProductId, OccurredAt`), sin joins. Agregar un tipo nuevo es una subclase + un valor del discriminador + columnas nulas nuevas.
- El DTO hacia la API/MCP es igual de polimórfico: `[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]` en el DTO base, así Hey-API genera una unión discriminada en TypeScript.

**Ojo con el filtro por hogar**: hoy `ApplyHouseholdFilters` recorre **todos** los entity types que implementan `IHasHousehold`, y las subclases de TPH también lo implementan (por herencia). EF solo permite query filters en la **raíz** de la jerarquía, así que el modelo fallaría al construirse. El arreglo es de una línea: filtrar con `e.BaseType == null` en ese `Where` (el filtro de la raíz aplica a todas las subclases). Vale la pena una prueba en `TenantIsolationTests` con un evento de cada tipo.

**¿Cuánta información guardar?** El criterio: **guardar todo lo que llega gratis y no pedirle al usuario nada extra.** Capturar datos es justo la fricción que queremos quitar.

| Dato | ¿Guardarlo? | Por qué |
| --- | --- | --- |
| Fecha y quién | **Sí, siempre** | Es la base de la regla y del aprendizaje. |
| Cantidad + unidad comprada | **Sí** (por defecto, la cantidad del producto) | Escala t (comprar 2 dura el doble) y mejora la sugerencia del intervalo. |
| Precio total | **Opcional**, sin pedirlo en la UI | Llega gratis en el ticket (vía agente). Habilita "gasto por mes/categoría" y "el shampoo subió 20 %". Se guarda el **total de la línea** (es lo que trae el ticket); el unitario se calcula. La moneda va **en cada compra** (ver 3.1.2). |
| Marca | **Opcional** por compra + `PreferredBrand` en el producto | La marca preferida sí es útil en la lista ("Colgate"). La de cada compra solo sirve para análisis, así que se guarda solo si llega del ticket. |
| Tienda | **Opcional** | Llega gratis en el ticket. A futuro sirve para comparar precios entre tiendas. |
| Texto de la línea del ticket | **Sí, si viene del ticket** | Con él se aprenden alias ("SHAMP H&S 400ML" → Shampoo), y el siguiente empate del agente es mejor (un `ProductAlias` a futuro). |
| Foto del ticket | **No** (por ahora) | Costo de almacenamiento y privacidad, y no aporta después de extraer los datos. |

### 3.1.2 Dinero y moneda

**Hoy el sistema no guarda dinero en ningún lado**: ninguna entidad tiene precios ni montos de dinero. `Ingredient.Amount` y `ShoppingItem.Amount` son **cantidades** (gramos, piezas), no dinero.

Con esta propuesta, el dinero aparece **en un solo lugar**: `ProductPurchased.Price` (`Money` = monto + moneda), y solo en las compras que lo traigan (casi siempre del ticket vía el agente).

- **Tipo**: `decimal` en C# / `numeric(12,2)` en Postgres. Nunca `float`/`double` para dinero.
- **Moneda en cada compra (recomendado)**, no solo a nivel de hogar:
  - El hogar tiene `DefaultCurrency` (p. ej. `MXN`), que se **copia** al evento al registrarlo si no viene otra. El agente puede mandar otra si el ticket es de otra moneda.
  - **Por qué no solo por hogar**: si el hogar cambia de moneda, compra en un viaje o paga en dos monedas (pasa en algunos países), un valor solo por hogar **reetiquetaría todo el historial** de golpe. Guardarla en el evento lo deja inmutable y correcto, y cuesta una columna de 3 caracteres.
  - Los reportes **agrupan por moneda** y nunca suman monedas distintas. No hay conversión de tipo de cambio (fuera del alcance).
- **No se guarda precio** en `Product` (ni "precio estimado") ni en `ShoppingItem` en el MVP. Si más adelante se quiere un presupuesto estimado de la lista, el "último precio conocido" sale del log.
- **Value object `Money(decimal Amount, string Currency)`**, mapeado como complex/owned type de EF: garantiza que nunca haya monto sin moneda y se reutiliza si el dinero aparece en otros lados (presupuestos, gastos).

Lo que sale del log (todo en C#, sin esquema extra):

- **Sugerir t**: mediana de los días entre compras, normalizada por cantidad. Agotar antes de t indica que el intervalo es largo; posponer seguido indica que es corto.
- **Gasto** por mes y por categoría, y la evolución del precio de cada producto.
- **Deshacer** una compra: `PurchaseReverted` y recalcular el estado desde el último `Purchased` vigente.

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
- Al marcar como comprado un artículo con `ProductId`, se actualiza el `Product` (`LastPurchasedOn`, y se limpian `OutOfStockAt` y `SnoozedUntil`). **Así se cierra el ciclo.** Si se desmarca el mismo día, se revierte (se guardan los valores anteriores o se recalcula desde el historial).
- Un artículo manual puede pedir **"hacerlo recurrente"**: se crea el `Product` y se vincula. Es la forma más natural de llenar el catálogo.

### 3.3 Sincronizar la lista (un comando, idempotente)

`SyncShoppingListCommand` reemplaza a `GenerateShoppingListCommand`:

1. Calcula la **ventana**: desde hoy hasta el próximo **día de compra** del hogar (nuevo `Household.ShoppingDay : DayOfWeek?`, **opcional**). Sin día de compra, la ventana es **hoy + 7 días** (para el menú) y la regla de recurrencia se evalúa contra hoy (3.1).
2. **Recurrentes y agotados**: los `Product` activos que cumplan la regla de aparición (3.1), que **no** tengan ya un `ShoppingItem` pendiente (sin comprar y sin archivar) con ese `ProductId` → se crean como `Source = Recurring`.
3. **Menú**: los ingredientes de los `MealPlan` dentro de la ventana, consolidados como hoy. Se reemplazan solo los `MealPlan` **sin comprar**; los comprados se conservan (corrige el problema 1).
4. Si no hay nada que agregar, no falla: la lista se queda igual (corrige el problema 3).

¿Cuándo se ejecuta?

- **MVP**: al abrir `/shopping` (en el loader) y con el botón "Actualizar lista". Es idempotente, así que repetirlo no causa problemas. No requiere jobs ni cambios de infraestructura.
- **Después**: un cron semanal (ya existe el patrón de Vercel Cron + `CRON_SECRET` de `/api/images/cleanup`) que recorre los hogares en su `ShoppingDay - 1` para sincronizar y **notificar** ("Tu lista para mañana tiene 12 cosas"). Solo vale la pena cuando haya notificaciones (push/correo).

**¿La lista como vista del log de eventos, o como tabla sincronizada?** Recomendación: **tabla** (`ShoppingItem`) + **log** (`ProductEvent`) + **estado actual en el `Product`**, todo escrito en la misma transacción. Es el patrón "estado + bitácora", no event sourcing:

- **La lista tiene estado propio que no viene del log**: artículos manuales, ingredientes del menú consolidados, cantidades editadas a mano, el check mientras recorres el súper, y el archivo al terminar la compra. Para que fuera una vista, todo eso tendría que convertirse en eventos y la vista tendría que reproducirlos. Eso es event sourcing completo, mucho más complejo de lo que el problema pide.
- **La regla vive en C#, no en SQL**: "próximo día de compra del hogar", "t escalado por cantidad" y "pospuesto" se expresan y se prueban fácil en el dominio (con EF InMemory, como el resto). Como vista de Postgres, la lógica quedaría en SQL, sin pruebas con InMemory y dependiente de la fecha del servidor.
- **La UI necesita ids estables**: para el check optimista y para editar. Las filas reales los tienen; las filas calculadas no.
- **El log sigue siendo la fuente de verdad del historial**: si el estado del `Product` se corrompe, se puede recalcular desde los eventos.

*Alternativa intermedia* (descartada por ahora): no materializar los recurrentes y unirlos "virtualmente" al leer la lista (tabla + productos vencidos calculados). Evita la sincronización, pero complica los ids, las ediciones y el check. La sincronización idempotente es más simple.

### 3.4 Ciclo de vida de la lista

- Acción **"Terminar compra"**: pone `ArchivedAt` en todos los comprados. La lista vuelve a quedar limpia y el historial se guarda (corrige el problema 2).
- Los pendientes no se archivan: pasan a la siguiente compra.
- Vista agrupada por `Category` (y los artículos del menú bajo "Comida de la semana" o en su categoría si están vinculados a un `Product`).
- *Descartado por ahora*: varias listas por hogar (súper / farmacia). La categoría cubre el 90 % del caso con mucha menos complejidad.

### 3.5 Revisar el modelo del menú

Cambios recomendados, en orden de valor:

1. **Porciones**: `Dish.Servings` (rinde para N personas) + `MealPlan.Servings` (para cuántos se cocina, por defecto `Household.DefaultServings`). Al generar la lista: `Amount * MealPlan.Servings / Dish.Servings`.
2. **Ingrediente ↔ Producto (opcional)**: `Ingredient.ProductId?`. Sirve para unificar los nombres ("Arroz" del platillo = "Arroz" de la despensa), sacar la categoría para agrupar y, más adelante, el inventario ("ya tengo arroz"). Se puede hacer **de forma gradual**: al guardar un ingrediente se busca coincidencia por nombre normalizado o se ofrece crear el producto. No es necesario para el MVP de recurrentes.
3. Semana alineada al `ShoppingDay` del hogar (o a los próximos 7 días si no tiene) en lugar del lunes fijo (esto viene con 3.3).
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

### 4.3 Autenticación: Amazon Cognito + invitaciones firmadas

**Propuesta (del dueño del producto)**: usar **Amazon Cognito** (free tier) como proveedor de identidad, tanto para la web como para el MCP, con un control de quién se puede registrar, para que nadie ajeno consuma el free tier. Ese control se decidió como **invitaciones firmadas** (abajo).

**Lo que se gana**

- **Un servidor OAuth/OIDC administrado** para el MCP, sin construir uno propio con OpenIddict. Este era el punto más caro de la propuesta anterior.
- Login administrado (Managed Login, con la marca nueva), **recuperación de contraseña y confirmación de correo** (hoy no están implementadas), MFA y login con Google sin código propio.
- Encaja con la infraestructura, que ya está en AWS (Lambda + Terraform).
- Costo: el free tier cubre **10,000 MAU al mes** de inicio de sesión directo o social en los tiers Lite y Essentials. El federado SAML/OIDC solo cubre 50 MAU, pero Google cuenta como "social", no como federado. El tier Plus no tiene free tier: hay que **fijar Essentials o Lite en Terraform**.

**Control de registro: enlaces de invitación firmados (sin tabla de correos)**

Propuesta del dueño del producto: reemplazar la tabla de correos permitidos por un **enlace de invitación firmado criptográficamente y stateless**. Evaluación: **sí, y además simplifica la infraestructura**, siempre que se combine con **desactivar el auto-registro en Cognito**:

1. El admin general genera una invitación: `{ email, householdId?, role?, exp }` firmado (y cifrado) con **ASP.NET Data Protection** (`ITimeLimitedDataProtector`). Las llaves **ya están persistidas en Postgres** (`DataProtectionKeys`), así que no hay que administrar ningún secreto nuevo.
2. El invitado abre `/invitacion?t=…`. El backend verifica la firma y la expiración, y crea el usuario con **`AdminCreateUser`** de Cognito usando **ese** correo. El auto-registro está desactivado (`AllowAdminCreateUserOnly = true`), así que **nadie puede registrarse sin invitación**, aunque conozca la URL de Managed Login.
3. Cognito le manda la contraseña temporal (o se usa el flujo de "establecer contraseña" en el primer login de Managed Login), y se redirige al login.
4. Si la invitación trae `householdId`, al crear el `AppUser` se une a ese hogar. **Unifica "permiso para registrarse" y "unirse al hogar"** (hoy existe un `InviteCode` por hogar; ese puede seguir para usuarios ya registrados).

Las propiedades que importan:

| Riesgo | Cómo se cubre |
| --- | --- |
| Reenviar el enlace a otra persona | El token está **ligado al correo**. Cognito verifica ese correo, y quien no lo controla no puede completar el registro. |
| Usarlo varias veces | Es de un solo uso de forma natural: la segunda vez `AdminCreateUser` falla porque el usuario ya existe. No hace falta guardar estado. |
| Revocar una invitación antes de que expire | Stateless no permite revocar una por una. Se mitiga con **expiración corta (p. ej. 72 h)**. Como último recurso, una "fecha mínima de emisión" en configuración invalida todas las anteriores. |
| Abuso del free tier | Solo quien tiene invitación crea usuario, y solo el admin general emite invitaciones (grupo `admins` de Cognito o claim de sistema). |

- **Con esto desaparecen el trigger Pre sign-up, la Lambda extra y la tabla DynamoDB** de la propuesta anterior.
- **Con Google (issue M)**: un login federado puede crear usuarios aunque el auto-registro esté desactivado. Hay que verificarlo, y probablemente se necesite igual un trigger Pre sign-up `ExternalProvider` que **solo permita vincular** a un usuario ya invitado con el mismo correo (`AdminLinkProviderForUser`). Esa validación no necesita tabla: basta con buscar si ya existe un usuario con ese correo en el pool.

**Cómo encaja con el BFF actual (web)**

- Se mantiene el patrón BFF: el backend es un **cliente OIDC confidencial** de Cognito (authorization code + PKCE). Al volver del login, busca o crea el `AppUser` por `sub` (nueva columna `CognitoSub`, única) y emite **la misma cookie propia** `__Host-…auth` con los claims `household_id` / `household_role`. El resto del sistema (tenancy, policies, `fetchCurrentUser`) no cambia.
- **Decisión: Managed Login de Cognito al inicio.** Las rutas `login`, `register`, `forgot-password` y `reset-password` del frontend se reemplazan por una redirección. Las pantallas propias (issue L) y el login con Google (issue M) quedan como issues aparte.
- ASP.NET Identity queda como modelo de usuario/hogar, sin contraseñas. El password hashing y el `SignInManager` de contraseñas se retiran.
- **Usuarios existentes**: se crean con `AdminCreateUser` (mismo correo) y se vinculan por correo al `AppUser` en su primer login. Cognito no puede importar los hashes de Identity. Como hay pocos usuarios, cada uno establece su contraseña en el primer login. La otra opción es un trigger *User migration*, que no vale la pena a esta escala.
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

**¿App client de Cognito dinámico por cada cliente de Claude, o uno fijo en Terraform?** **Uno fijo en Terraform, reutilizado.** De hecho, dos: `web-bff` (el login de la web) y `mcp-gateway` (la capa OAuth). Así se pueden dar distintos scopes y duraciones de token a cada uno, y revocarlos por separado. Por qué no crearlos dinámicamente:

- **Nada lo requiere**: Cognito solo ve **nuestro** callback (`/oauth/callback`), nunca el `redirect_uri` de cada cliente, así que un solo app client sirve para todos.
- **Cuotas y abuso**: `/oauth/register` es público por especificación. Si cada registro creara un app client, cualquiera podría agotar la cuota del pool, y habría que limpiar los clientes huérfanos.
- **Drift de Terraform**: recursos creados fuera del estado de Terraform, con secrets que habría que guardar en algún lado, y permisos IAM de escritura sobre el user pool para la API.
- La distinción por cliente ("revocar el acceso de Claude Code") se hace con **nuestro** `client_id` (va en el estado del código y se puede registrar en la auditoría) y con `RevokeToken` de Cognito sobre los refresh tokens del usuario.

**Estado de la capa: casi stateless, y sin DynamoDB.**

- **Registros DCR stateless**: el `client_id` que emite `/oauth/register` **es** un payload protegido con Data Protection que contiene los `redirect_uris` y la fecha. Validarlo no requiere tabla, y los registros abandonados no dejan basura.
- **`state` / PKCE entre `/authorize` y `/callback`**: también va protegido dentro del `state` que viaja a Cognito y regresa. Sin tabla.
- **Códigos propios de un solo uso**: es lo único que necesita estado, porque OAuth exige que un código no se use dos veces. Una tabla Postgres pequeña `OAuthAuthorizationCode` (hash del código, tokens de Cognito cifrados con Data Protection, PKCE, `ExpiresAt` de ~60 s, `ConsumedAt`) se consume con un `UPDATE … WHERE ConsumedAt IS NULL` atómico y se limpia en el cron.

Con las invitaciones firmadas y este diseño, **DynamoDB ya no es necesario en ninguna parte**: un almacén menos que operar, permisos IAM menos y nada que emular en local.
- **Anti-abuso**: `/oauth/register` es público por especificación, así que lleva rate limiting y solo acepta `redirect_uris` de una lista permitida (callback de claude.ai y loopback `http://127.0.0.1` / `http://localhost`). En CIMD, solo se aceptan hosts de `client_id` de confianza (claude.ai, …). De todas formas, nadie obtiene tokens sin un usuario de Cognito, y para eso necesita una invitación.
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
| `list_products` | lectura | Incluye la última compra, si está agotado y cuándo vuelve a tocar. |
| `create_dishes` | escritura | **En lote**: platillos con ingredientes, etiquetas (se crean si no existen) y porciones, en una sola llamada. |
| `plan_meals` | escritura | En lote: `[{date, mealType, dishId, servings}]`. Pasa por vista previa y confirmación (4.4.1). |
| `upsert_products` | escritura | En lote, con intervalo y última compra. |
| `add_shopping_items` | escritura | En lote. |
| `mark_items_purchased` | escritura | En lote, por `ids` + `purchasedAt` opcional (la fecha del ticket). Es reversible. |
| `mark_out_of_stock` | escritura | "Se acabó X": acepta nombres, resuelve el producto (o propone crearlo) y lo agrega a la lista. |
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

Las operaciones pequeñas y reversibles (`mark_items_purchased`, `mark_out_of_stock`, `postpone_product`, agregar 1 o 2 artículos) **se aplican directo** y devuelven un resumen con la opción de deshacer. Con el ticket, el agente ya muestra el empate en el chat, y obligar a confirmar dos veces cada compra sería fricción.

**Decisión: Postgres.** Razones: el filtro por hogar (`IHasHousehold`) aplica gratis, se usan los mismos handlers y las mismas pruebas, y no se agregan dependencias de AWS a la API. El TTL se cubre con `ExpiresAt` + limpieza en el cron.

**Modelo propuesto**

```csharp
public class PendingOperation : IHasHousehold
{
    Guid Id; Guid HouseholdId;
    Guid CreatedByUserId;
    string? McpClientId;               // nuestro client_id de la capa OAuth (auditoría)
    PendingOperationKind Kind;         // CreateDishes | PlanMeals | UpsertProducts | AddShoppingItems | Batch
    int PayloadVersion;                // para poder cambiar el formato sin romper las pendientes
    PendingOperationPayload Payload;   // jsonb: los comandos MediatR ya validados (ver abajo)
    string PayloadHash;                // sha256 del payload canónico: detecta propuestas duplicadas
    OperationPreview Preview;          // jsonb: el resumen que se mostró al usuario
    PendingOperationStatus Status;     // Pending | Applying | Applied | Cancelled | Expired | Failed
    OperationResult? Result;           // jsonb: ids creados, para que confirmar dos veces devuelva lo mismo
    string? Error;
    DateTime CreatedAt, ExpiresAt;     // ~30 min
    DateTime? ResolvedAt;
    uint Version;                      // token de concurrencia (xmin de Npgsql)
}
```

- **El payload son los propios comandos de MediatR**, serializados con un tipo por clase (`[JsonPolymorphic]` / `[JsonDerivedType]`): `CreateDishCommand`, `CreateMealPlanCommand`… No se inventa un formato paralelo.
- **Ids asignados al proponer**: si la operación crea un platillo y lo programa en la misma propuesta, el platillo ya trae su `Guid` v7 en el payload y `CreateMealPlanCommand` lo referencia. Así el resultado es determinista y la vista previa puede mostrar los ids que tendrán. Requiere que los comandos de creación acepten un `Id` opcional.
- **Confirmar** (`ConfirmPendingOperationCommand`):
  1. Carga la operación (con el filtro por hogar), y comprueba `CreatedByUserId == usuario actual`, `Status == Pending` y que no haya expirado.
  2. La pasa a `Applying` con un update condicional (`WHERE Status = 'Pending'`, o el token de concurrencia), para que dos confirmaciones simultáneas no la apliquen dos veces.
  3. Abre una transacción y manda cada comando por `IMediator`. **El `ValidationBehavior` corre de nuevo**: esa es la revalidación.
  4. Si todo sale bien, `Applied` + `Result`. Si algo falla, rollback, `Failed` + `Error` legible, y el agente vuelve a proponer.
  5. Si ya estaba `Applied`, devuelve el `Result` guardado (idempotente).
- **Transacciones**: hoy cada handler llama a `SaveChangesAsync`. Para aplicar en bloque hace falta envolverlos en una transacción explícita (`BeginTransactionAsync`), o un `IUnitOfWork` sencillo. EF InMemory ignora las transacciones, así que el rollback se prueba aparte (Testcontainers con Postgres, o se acepta como hueco conocido).
- **Limpieza**: el cron marca como `Expired` las vencidas y borra las resueltas con más de 30 días. Se pueden conservar más tiempo como auditoría de lo que hizo el agente.

*Alternativa futura*: la **elicitation** de MCP (el servidor le pide confirmación al usuario directamente en la UI del cliente) evitaría depender del agente, pero el soporte en los clientes es desigual. Conviene revisarla más adelante.

### 4.5 Dependencias y orden

- El MCP **no depende** del catálogo de productos para arrancar: v1 puede exponer platillos, menú y lista. Pero el caso del ticket brilla de verdad con C (`PurchasedAt` + recurrentes que se recalculan), y crear platillos para N personas necesita E (porciones).
- Por eso **E (porciones) sube de prioridad**: sin porciones, "menú para 4 personas" no se traduce en cantidades correctas.
- Las herramientas de productos se agregan cuando llegue B.

---

## 5. Preguntas abiertas (para decidir juntos)

1. **Nombre final**: Despi y Restocapp descartados (ya existen productos iguales). Mejores disponibles: **Repón** y **Nos Falta** (1.1).

### Decisiones tomadas

- **Autenticación**: Amazon Cognito (free tier, tier Essentials o Lite), con **Managed Login** al inicio. Pantallas propias → issue L. Login con Google → issue M.
- **Control de registro**: invitaciones firmadas (Data Protection), ligadas al correo, con el auto-registro de Cognito desactivado. Solo las emite el admin general. Sin tabla de correos ni DynamoDB (**aprobado**).
- **MCP**: capa CIMD + DCR delante de Cognito **desde el inicio** (issue K, requisito del MCP), con **un app client fijo en Terraform** (`mcp-gateway`) y estado casi stateless (solo los códigos de un solo uso en Postgres).
- **Día de compra opcional**: si existe, se anticipa contra él. Si no, se evalúa contra hoy, con la sección "Por vencer (7 días)", y el menú usa los próximos 7 días.
- **Historial de eventos** `ProductEvent` desde el MVP. Se guarda lo que llega gratis (cantidad siempre; precio, marca, tienda y línea del ticket si vienen del ticket), y t escala con la cantidad comprada.
- **Lista = tabla sincronizada + log**, no una vista del log.
- **Moneda**: se guarda **en cada compra** (`Money` = monto + moneda ISO 4217), con `Household.DefaultCurrency` como valor por defecto.
- **Log de eventos**: TPH (una tabla, una subclase por tipo de evento) (3.1.1).
- **Catálogo**: lo edita **cualquier miembro** del hogar (sin `IRequireHouseholdAdmin`).
- **Cookie y Data Protection**: se renombran ya, en el issue A (no hay usuarios en producción).
- **Cantidad comprada**: `ShoppingItem.Amount/Unit` → evento `Purchased` (fuente de verdad) → cache en `Product.LastPurchasedAmount/Unit`.
- **Regla de aparición de productos**: entran directo a la lista cuando ya pasó t desde la última compra **o** se marcaron como agotados (3.1).
- **Cambios en lote del agente**: vista previa y confirmación (4.4.1). Operaciones pendientes en Postgres con el modelo de 4.4.1.

---

## 6. Issues propuestos

Orden sugerido: **A** (independiente) · **B → C → D** · **E** (antes de que el MCP planee menús) · **J → K → I** (Cognito → capa OAuth → MCP) en paralelo con B/C. F/G/H/L/M después.

### A. Rebranding visible: ComeRico → {nombre}
- Decidir el nombre (sección 1.1) y conseguir el dominio.
- Cambiar los textos, el título, OG, el manifest, el header, la landing (nueva propuesta: lista + menú), el README y los íconos.
- Configurar el dominio nuevo en Vercel/infra con un 301 desde `comerico.davbrito.dev`.
- **Incluye** renombrar la cookie (`__Host-{marca}.auth`) y `SetApplicationName("{Marca}")` de Data Protection (decidido: no hay usuarios en producción).
- **Fuera del alcance**: namespaces, buckets, base de datos y repo.

### B. Catálogo de productos del hogar con intervalo de reposición
- Entidad `Product` (3.1), `ProductCategory`, `MeasurementUnit.Package` y la migración.
- CRUD `/api/products` y la página "Productos del hogar" (nombre, categoría, cantidad por defecto, "cada cuánto", última compra).
- `OutOfStockAt`, `SnoozedUntil`, `PreferredBrand`, `LastPurchasedAmount/Unit`, `Household.ShoppingDay?` y `Household.DefaultCurrency`. Cualquier miembro puede editar.
- Historial `ProductEvent` con TPH (3.1.1), escrito en la misma transacción que cada cambio de estado. Ajustar `ApplyHouseholdFilters` para aplicar solo a las raíces de jerarquía (`BaseType == null`), con prueba de aislamiento. Acción "Se acabó" en el catálogo.
- Pruebas: filtro por hogar y regla de aparición (tiempo con y sin día de compra, escalado por cantidad, agotado, pospuesto, sin intervalo, nunca comprado).

### C. Lista de compras unificada: recurrentes + menú + manuales
- `ShoppingItem.Source`, `ProductId`, `PurchasedAt` y la migración desde `IsAutoGenerated`.
- `Household.ShoppingDay`.
- `SyncShoppingListCommand` (3.3), que reemplaza a `generate`. Sincroniza al abrir la lista y con el botón.
- `SetShoppingItemPurchased` acepta `amount?`/`unit?` (y precio + moneda, marca y tienda opcionales). Marcar como comprado registra `ProductPurchased`, actualiza el `Product` y limpia agotado/pospuesto. Sección "Por vencer" cuando no hay día de compra. Marcar agotado agrega el artículo en el momento. Acción "Todavía tengo" (posponer).
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

### J. Migrar la autenticación a Amazon Cognito con invitaciones firmadas
- User pool (tier Essentials o Lite, fijado en Terraform), **Managed Login** con la marca nueva, **auto-registro desactivado** y app clients fijos `web-bff` y `mcp-gateway`.
- Invitaciones firmadas con Data Protection (`email`, `householdId?`, `exp`), emitidas solo por el admin general. Al abrirlas: `AdminCreateUser` + unirse al hogar.
- Backend: login OIDC → `AppUser` por `CognitoSub` → la misma cookie propia con claims del hogar. Retirar contraseñas de Identity.
- Frontend: reemplazar login/registro/recuperación por la redirección, y agregar la página de invitación.
- Migración de los usuarios existentes (`AdminCreateUser` + vinculación por correo).
- Pruebas: sin invitación no hay registro, una invitación expirada o alterada se rechaza, una invitación usada no crea un segundo usuario, y la sesión y la tenancy siguen igual.

### K. Capa OAuth (CIMD + DCR) delante de Cognito
- Endpoints de 4.3: metadata RFC 9728/8414, `/oauth/register`, `/oauth/authorize`, `/oauth/callback` y `/oauth/token`, con el app client `mcp-gateway` (Terraform).
- `client_id` de DCR y `state` stateless (Data Protection), y tabla `OAuthAuthorizationCode` para los códigos de un solo uso.
- Anti-abuso: rate limiting, lista permitida de `redirect_uris` y de hosts CIMD.
- Criterio de aceptación: agregar el conector **solo con la URL** en claude.ai (web y móvil) y en Claude Code, y obtener un access token de Cognito válido para `/mcp`.

### I. Servidor MCP v1 (depende de J y K)
- Endpoint `/mcp` (SDK de C#, Streamable HTTP stateless) en `ComeRico.Api`.
- Validación de access tokens de Cognito: JwtBearer, `token_use` / `client_id`, custom scopes `read` / `write` y `IClaimsTransformation` `sub` → hogar.
- Herramientas de 4.4 para platillos, menú y lista (las de productos llegan con B). `mark_items_purchased` acepta precio, marca, tienda y texto de la línea del ticket. Prompts `planear_menu_semanal` y `procesar_ticket`.
- **Vista previa y confirmación** para cambios en lote (4.4.1): `PendingOperation` (modelo de 4.4.1), `confirm_operation` y `cancel_operation`, revalidación, update condicional contra la doble aplicación, ids asignados al proponer y transacción.
- Auditoría `Origin = Agent` y rate limiting.
- Criterio de aceptación: el flujo del menú semanal (con vista previa) y el del ticket desde el móvil.
- Pruebas: aislamiento por hogar con bearer, scopes, que un usuario no pueda confirmar operaciones de otro hogar o de otro usuario, idempotencia de la confirmación, y que cada herramienta mande el comando correcto.

### L. Pantallas de login propias sobre Cognito
- Reemplazar Managed Login por pantallas propias (login, registro, recuperación) con la API de Cognito, si la experiencia de Managed Login se queda corta.

### M. Login con Google
- Google como proveedor social en el user pool, con el botón en el login. Trigger `PreSignUp_ExternalProvider` que solo permite vincular a un usuario ya invitado con el mismo correo (sin tabla).
- Probar el caso de un correo ya registrado con contraseña que entra con Google: vincular cuentas (`AdminLinkProviderForUser`) en lugar de duplicarlas.

### H. (Opcional, deuda) Rebranding técnico
- Namespaces `ComeRico.*`, paquetes `@comerico/*`, recursos de infraestructura con `moved`. Un PR mecánico aislado.
