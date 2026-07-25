import { z } from "@hono/zod-openapi";
import { HOUSEHOLD_ROLES, MEAL_TYPES, MEASUREMENT_UNITS, ROULETTE_STATUSES } from "../domain/enums";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "../features/images/rules";

// Single source of truth for the API's request and response schemas, used both
// to validate/serialize at runtime and to generate the OpenAPI document the
// frontend's client is built from. Request schemas carry the same Spanish
// validation messages the .NET FluentValidation rules produced.
//
// Dates are represented as ISO strings (mappers convert `Date` → string), which
// is what the JSON on the wire actually is.

const dateTime = z.string().openapi({ format: "date-time", example: "2026-07-09T12:00:00.000Z" });
const dateOnly = z.string().openapi({ format: "date", example: "2026-07-09" });

// ---- Shared -----------------------------------------------------------------

export const ErrorResponse = z.object({ message: z.string() }).openapi("ErrorResponse");
export const ValidationErrorResponse = z
  .object({ errors: z.array(z.object({ field: z.string(), message: z.string() })) })
  .openapi("ValidationErrorResponse");

export const MeasurementUnitSchema = z.enum(MEASUREMENT_UNITS).openapi("MeasurementUnit");
export const MealTypeSchema = z.enum(MEAL_TYPES).openapi("MealType");
export const HouseholdRoleSchema = z.enum(HOUSEHOLD_ROLES).openapi("HouseholdRole");
export const RouletteStatusSchema = z.enum(ROULETTE_STATUSES).openapi("RouletteStatus");

// ---- Auth -------------------------------------------------------------------

export const RegisterRequest = z
  .object({
    displayName: z.string().min(1, "El nombre es obligatorio."),
    email: z.string(),
    password: z.string(),
  })
  .openapi("RegisterRequest");

export const LoginRequest = z.object({ email: z.string(), password: z.string() }).openapi("LoginRequest");

export const ManageInfoRequest = z
  .object({ oldPassword: z.string().optional(), newPassword: z.string().optional() })
  .openapi("ManageInfoRequest");

export const UpdateProfileRequest = z
  .object({ displayName: z.string().min(1, "El nombre es obligatorio.") })
  .openapi("UpdateProfileRequest");

export const CurrentUserDto = z
  .object({
    id: z.string(),
    displayName: z.string(),
    email: z.string(),
    householdId: z.string().nullable(),
    householdName: z.string().nullable(),
    inviteCode: z.string().nullable(),
    role: HouseholdRoleSchema,
  })
  .openapi("CurrentUserDto");

export const InfoResponse = z
  .object({ email: z.string(), isEmailConfirmed: z.boolean() })
  .openapi("InfoResponse");

export const LoginResponse = z.looseObject({}).openapi("LoginResponse");

// ---- Households -------------------------------------------------------------

export const CreateHouseholdRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "El nombre del hogar es obligatorio.")
      .max(200, "El nombre no puede superar los 200 caracteres."),
  })
  .openapi("CreateHouseholdRequest");

export const JoinHouseholdRequest = z
  .object({
    inviteCode: z
      .string()
      .trim()
      .min(1, "El código de invitación es obligatorio.")
      .max(20, "El código de invitación no es válido."),
  })
  .openapi("JoinHouseholdRequest");

export const RenameHouseholdRequest = CreateHouseholdRequest.openapi("RenameHouseholdRequest");

export const HouseholdDto = z
  .object({ id: z.string(), name: z.string(), inviteCode: z.string(), createdAt: dateTime })
  .openapi("HouseholdDto");

export const HouseholdMemberDto = z
  .object({ id: z.string(), displayName: z.string(), role: HouseholdRoleSchema, createdAt: dateTime })
  .openapi("HouseholdMemberDto");

export const HouseholdMemberList = z.array(HouseholdMemberDto).openapi("HouseholdMemberList");

// ---- Dishes / tags ----------------------------------------------------------

export const IngredientInput = z
  .object({
    name: z
      .string()
      .min(1, "El nombre del ingrediente es obligatorio.")
      .max(200, "El nombre del ingrediente no puede superar los 200 caracteres."),
    amount: z.number().gt(0, "La cantidad debe ser mayor que cero."),
    unit: z.enum(MEASUREMENT_UNITS, { error: "La unidad de medida no es válida." }),
  })
  .openapi("IngredientInput");

export const IngredientDto = z
  .object({ id: z.string(), name: z.string(), amount: z.number(), unit: MeasurementUnitSchema })
  .openapi("IngredientDto");

export const TagDto = z.object({ id: z.string(), name: z.string() }).openapi("TagDto");

export const DishDto = z
  .object({
    id: z.string(),
    householdId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: dateTime,
    ingredients: z.array(IngredientDto),
    tags: z.array(TagDto),
  })
  .openapi("DishDto");

export const DishList = z.array(DishDto).openapi("DishList");

const dishName = z
  .string()
  .min(1, "El nombre del platillo es obligatorio.")
  .max(200, "El nombre no puede superar los 200 caracteres.");
const dishDescription = z.string().max(1000, "La descripción no puede superar los 1000 caracteres.").nullish();

export const CreateDishRequest = z
  .object({
    name: dishName,
    description: dishDescription,
    imageUploadId: z.string().nullish(),
    ingredients: z.array(IngredientInput).optional(),
  })
  .openapi("CreateDishRequest");

export const UpdateDishRequest = z
  .object({
    name: dishName,
    description: dishDescription,
    imageUploadId: z.string().nullish(),
    removeImage: z.boolean().optional().default(false),
  })
  .openapi("UpdateDishRequest");

export const SetIngredientsRequest = z
  .object({ ingredients: z.array(IngredientInput) })
  .openapi("SetIngredientsRequest");

export const SetTagsRequest = z
  .object({
    tagNames: z.array(
      z
        .string()
        .min(1, "El nombre de la etiqueta es obligatorio.")
        .max(50, "El nombre de la etiqueta no puede superar los 50 caracteres."),
    ),
  })
  .openapi("SetTagsRequest");

export const CreateTagRequest = z
  .object({
    name: z
      .string()
      .min(1, "El nombre de la etiqueta es obligatorio.")
      .max(50, "El nombre no puede superar los 50 caracteres."),
  })
  .openapi("CreateTagRequest");

export const TagList = z.array(TagDto).openapi("TagList");

// ---- Meal plans -------------------------------------------------------------

export const MealPlanDto = z
  .object({
    id: z.string(),
    date: dateOnly,
    mealType: MealTypeSchema,
    dishId: z.string(),
    dishName: z.string(),
    dishImageUrl: z.string().nullable(),
  })
  .openapi("MealPlanDto");

export const MealPlanList = z.array(MealPlanDto).openapi("MealPlanList");

export const MealPlanRangeQuery = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.").openapi({ example: "2026-07-06" }),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.").openapi({ example: "2026-07-12" }),
  })
  .refine((v) => v.to >= v.from, { error: "La fecha final debe ser posterior o igual a la inicial.", path: ["to"] });

export const CreateMealPlanRequest = z
  .object({
    dishId: z.string().min(1, "El platillo es obligatorio."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
    mealType: z.enum(MEAL_TYPES, { error: "El tipo de comida no es válido." }),
  })
  .openapi("CreateMealPlanRequest");

// ---- Shopping ---------------------------------------------------------------

export const ShoppingItemDto = z
  .object({
    id: z.string(),
    name: z.string(),
    amount: z.number().nullable(),
    unit: MeasurementUnitSchema.nullable(),
    isPurchased: z.boolean(),
    isAutoGenerated: z.boolean(),
    generatedForWeekStart: dateOnly.nullable(),
    createdAt: dateTime,
  })
  .openapi("ShoppingItemDto");

export const ShoppingItemList = z.array(ShoppingItemDto).openapi("ShoppingItemList");

export const CreateShoppingItemRequest = z
  .object({
    name: z
      .string()
      .min(1, "El nombre del artículo es obligatorio.")
      .max(200, "El nombre no puede superar los 200 caracteres."),
    amount: z.number().gt(0, "La cantidad debe ser mayor que cero.").nullish(),
    unit: z.enum(MEASUREMENT_UNITS, { error: "La unidad de medida no es válida." }).nullish(),
  })
  .openapi("CreateShoppingItemRequest");

export const GenerateShoppingListRequest = z
  .object({ anyDateInWeek: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida.") })
  .openapi("GenerateShoppingListRequest");

export const SetPurchasedRequest = z.object({ isPurchased: z.boolean() }).openapi("SetPurchasedRequest");

// ---- Roulette ---------------------------------------------------------------

export const SpinRouletteResult = z
  .object({
    sessionId: z.string(),
    householdId: z.string(),
    winnerDishId: z.string(),
    winnerDishName: z.string(),
    spunAt: dateTime,
  })
  .openapi("SpinRouletteResult");

export const RouletteSessionDto = z
  .object({
    id: z.string(),
    householdId: z.string(),
    status: RouletteStatusSchema,
    winnerDishId: z.string().nullable(),
    winnerDishName: z.string().nullable(),
    createdAt: dateTime,
    spunAt: dateTime.nullable(),
  })
  .openapi("RouletteSessionDto");

export const RouletteHistoryList = z.array(RouletteSessionDto).openapi("RouletteHistoryList");

export const RouletteHistoryQuery = z.object({
  page: z.coerce.number().int().optional().openapi({ example: 1 }),
  pageSize: z.coerce.number().int().optional().openapi({ example: 20 }),
});

// ---- Images -----------------------------------------------------------------

export const CreateUploadRequest = z
  .object({
    type: z.literal("image", { error: "Tipo no soportado. Usa 'image'." }),
    keyFolder: z.enum(["dishes"], { error: "Carpeta de destino no permitida." }),
    contentType: z
      .string()
      .refine((ct) => ct in ALLOWED_IMAGE_TYPES, "Formato no soportado. Usa JPG, PNG, WebP, AVIF o GIF."),
    sizeBytes: z
      .number()
      .int()
      .gt(0, "El archivo está vacío.")
      .max(MAX_IMAGE_BYTES, "La imagen no puede superar 5 MB."),
  })
  .openapi("CreateUploadRequest");

export const UploadTicketDto = z
  .object({ uploadId: z.string(), uploadUrl: z.string() })
  .openapi("UploadTicketDto");

export const IdParam = z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) });

// Inferred TS types reused by handlers/mappers.
export type CurrentUser = z.infer<typeof CurrentUserDto>;
export type Dish = z.infer<typeof DishDto>;
export type MealPlan = z.infer<typeof MealPlanDto>;
export type ShoppingItem = z.infer<typeof ShoppingItemDto>;
export type RouletteSession = z.infer<typeof RouletteSessionDto>;
export type SpinResult = z.infer<typeof SpinRouletteResult>;
export type Household = z.infer<typeof HouseholdDto>;
export type HouseholdMember = z.infer<typeof HouseholdMemberDto>;
export type IngredientInputType = z.infer<typeof IngredientInput>;
