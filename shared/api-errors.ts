// Machine-readable error codes for the public cart and checkout endpoints.
//
// These codes give headless storefronts a stable enum to branch on instead of
// brittle message string-matching. Each code maps to a canonical English
// message; routes may pass an override message (e.g. one that mentions the
// package name) but the `code` field stays stable.

export const CartCheckoutErrorCode = {
  // Validation / shape
  INVALID_DATA: "INVALID_DATA",
  INVALID_PACKAGE: "INVALID_PACKAGE",
  INVALID_LOCATION: "INVALID_LOCATION",
  PACKAGE_INACTIVE: "PACKAGE_INACTIVE",
  // Cohort / offering
  COHORT_SELECTION_REQUIRED: "COHORT_SELECTION_REQUIRED",
  OFFERING_NOT_FOUND: "OFFERING_NOT_FOUND",
  OFFERING_NOT_BOOKABLE: "OFFERING_NOT_BOOKABLE",
  OFFERING_PACKAGE_MISMATCH: "OFFERING_PACKAGE_MISMATCH",
  // Channel flags / upsells
  PACKAGE_NOT_STANDALONE: "PACKAGE_NOT_STANDALONE",
  PACKAGE_NOT_AVAILABLE: "PACKAGE_NOT_AVAILABLE",
  UPSELL_PARENT_MISSING: "UPSELL_PARENT_MISSING",
  // Locations
  LOCATION_REQUIRED: "LOCATION_REQUIRED",
  LOCATION_NOT_ALLOWED: "LOCATION_NOT_ALLOWED",
  CART_LOCATION_MISMATCH: "CART_LOCATION_MISMATCH",
  // Cart state
  CART_NOT_FOUND: "CART_NOT_FOUND",
  CART_NOT_EDITABLE: "CART_NOT_EDITABLE",
  CART_EMPTY: "CART_EMPTY",
  CART_ALREADY_PROCESSED: "CART_ALREADY_PROCESSED",
  CART_ID_REQUIRED: "CART_ID_REQUIRED",
  // Payment
  PAYMENT_PROVIDER_NOT_CONFIGURED: "PAYMENT_PROVIDER_NOT_CONFIGURED",
} as const;

export type CartCheckoutErrorCode =
  (typeof CartCheckoutErrorCode)[keyof typeof CartCheckoutErrorCode];

export const CART_CHECKOUT_ERROR_MESSAGES: Record<CartCheckoutErrorCode, string> = {
  INVALID_DATA: "Invalid data",
  INVALID_PACKAGE: "Invalid package",
  INVALID_LOCATION: "Invalid location",
  PACKAGE_INACTIVE: "Package is not active",
  COHORT_SELECTION_REQUIRED:
    "This package requires picking a class schedule. Please use the cart checkout flow (/cart-checkout/start) so a specific offering can be selected.",
  OFFERING_NOT_FOUND: "Offering not available",
  OFFERING_NOT_BOOKABLE: "Offering is not available for booking",
  OFFERING_PACKAGE_MISMATCH: "Offering does not fulfill this package",
  PACKAGE_NOT_STANDALONE:
    "This package is only available as an upsell. Add it to a cart that already contains its parent package.",
  PACKAGE_NOT_AVAILABLE: "This package is not available for purchase",
  UPSELL_PARENT_MISSING:
    "This add-on can only be added when its parent package is in the cart",
  LOCATION_REQUIRED:
    "This package is restricted to specific locations. Please select a location to continue.",
  LOCATION_NOT_ALLOWED: "This package is not available at the selected location.",
  CART_LOCATION_MISMATCH: "This cart is already associated with a different location.",
  CART_NOT_FOUND: "Cart not found",
  CART_NOT_EDITABLE: "Cart is no longer editable",
  CART_EMPTY: "Cart is empty",
  CART_ALREADY_PROCESSED: "Cart already processed",
  CART_ID_REQUIRED: "cartId required",
  PAYMENT_PROVIDER_NOT_CONFIGURED: "Payment not configured for this school",
};

// Error class thrown by storage helpers (e.g. addCartItem) so route handlers
// can surface a stable `code` in the JSON response while preserving the
// existing human-readable `message` string.
export class CartCheckoutError extends Error {
  public readonly code: CartCheckoutErrorCode;
  public readonly details?: Record<string, unknown>;
  constructor(
    code: CartCheckoutErrorCode,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? CART_CHECKOUT_ERROR_MESSAGES[code]);
    this.name = "CartCheckoutError";
    this.code = code;
    this.details = details;
  }
}

export type CartCheckoutErrorBody = {
  code: CartCheckoutErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export function cartCheckoutErrorBody(
  code: CartCheckoutErrorCode,
  message?: string,
  details?: Record<string, unknown>,
): CartCheckoutErrorBody {
  const body: CartCheckoutErrorBody = {
    code,
    message: message ?? CART_CHECKOUT_ERROR_MESSAGES[code],
  };
  if (details !== undefined) body.details = details;
  return body;
}
