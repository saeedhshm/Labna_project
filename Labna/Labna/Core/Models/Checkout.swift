import Foundation

/// Request body for `POST /orders`.
///
/// Mirrors the strict `checkoutRequest` schema in `@labna/contracts`. Only
/// identifiers, quantities and the customer's own checkout selections travel
/// over the wire: prices, inventory, delivery fee, discounts and totals are
/// decided by the server and are never sent from here.
struct CheckoutRequest: Encodable, Sendable {
    let customer: CheckoutCustomer
    let address: CheckoutAddress
    let branchID: String?
    let items: [CheckoutRequestItem]
    let couponCode: String
    let paymentMethod: PaymentMethod

    /// `customerID` is intentionally never sent. The API links the order to the
    /// signed-in customer from the Bearer token, so the app cannot ask for
    /// ownership of somebody else's order history.
    enum CodingKeys: String, CodingKey {
        case customer, address, branchID, items, couponCode, paymentMethod
    }
}

struct CheckoutRequestItem: Encodable, Sendable {
    let productID: String
    let variantID: String
    let quantity: Int
}

struct CheckoutCustomer: Codable, Hashable, Sendable {
    let name: String
    let phoneNumber: String
    let email: String?

    init(name: String, phoneNumber: String, email: String?) {
        self.name = name
        self.phoneNumber = phoneNumber
        self.email = email
    }

    /// Prefilled from the signed-in customer so the shopper rarely has to type
    /// anything. Uses the same contract limits as `checkoutCustomer`.
    init(customer: Customer) {
        self.init(name: customer.name, phoneNumber: customer.phoneNumber, email: customer.email)
    }
}

/// Delivery address, matching `checkoutAddress`.
struct CheckoutAddress: Codable, Hashable, Sendable {
    let city: String
    let area: String
    let street: String
    let building: String
    let floor: String
    let apartment: String
    let notes: String
}

/// Payment methods the API accepts. Raw values match `paymentMethod`.
enum PaymentMethod: String, Codable, Hashable, Sendable, CaseIterable {
    case cashOnDelivery = "cash_on_delivery"
    case demoCardSuccess = "demo_card_success"
    case demoCardFailure = "demo_card_failure"

    /// Only real payment is offered in the storefront; the demo card methods
    /// exist for exercising the API's failure paths.
    static var storefrontChoices: [PaymentMethod] { [.cashOnDelivery] }

    var messageKey: String {
        switch self {
        case .cashOnDelivery: "checkout.payment.cod"
        case .demoCardSuccess: "checkout.payment.card"
        case .demoCardFailure: "checkout.payment.card"
        }
    }
}

/// Payment outcome, matching `paymentStatus`.
enum PaymentStatus: String, Decodable, Hashable, Sendable {
    case pending
    case paid
    case failed
}

/// Order lifecycle, matching `orderStatus`.
enum OrderStatus: String, Decodable, Hashable, Sendable {
    case pending
    case confirmed
    case preparing
    case ready
    case outForDelivery = "out_for_delivery"
    case completed
    case cancelled
}

/// A confirmed order exactly as the server recorded it.
///
/// Every money figure here comes from the API, so the confirmation screen can
/// quote real totals instead of re-deriving them on the device.
struct PlacedOrder: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let orderNumber: String
    let customerID: String?
    let customer: CheckoutCustomer
    let address: CheckoutAddress
    let branchID: String
    let items: [PlacedOrderItem]
    let currencyCode: String
    let subtotalMinor: Int
    let deliveryFeeMinor: Int
    let discountMinor: Int
    let totalMinor: Int
    let couponCode: String
    let payment: OrderPayment
    let status: OrderStatus
    let createdAt: String

    /// Whether the server actually honoured a submitted coupon.
    var couponApplied: Bool { discountMinor > 0 }

    /// A coupon was typed but the server gave no discount, which is how an
    /// unknown code is reported: there is no separate rejection for coupons.
    var couponIgnored: Bool { !couponCode.isEmpty && discountMinor == 0 }
}

struct PlacedOrderItem: Decodable, Sendable, Hashable {
    let productID: String
    let variantID: String
    let productName: LocalizedText
    let variantLabel: LocalizedText
    let quantity: Int
    let unitPriceMinor: Int
    let lineTotalMinor: Int
}

struct OrderPayment: Decodable, Sendable, Hashable {
    let method: PaymentMethod
    let status: PaymentStatus
    let providerReference: String?
}