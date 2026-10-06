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
///
/// `progressIndex` follows the only forward path the API allows:
/// `pending → confirmed → preparing → ready → out_for_delivery → completed`.
/// `cancelled` leaves the happy path and has no index.
enum OrderStatus: String, Decodable, Hashable, Sendable {
    case pending
    case confirmed
    case preparing
    case ready
    case outForDelivery = "out_for_delivery"
    case completed
    case cancelled

    /// The happy path in the order the API permits.
    static let lifecycle: [OrderStatus] = [.pending, .confirmed, .preparing, .ready, .outForDelivery, .completed]

    var isCancelled: Bool { self == .cancelled }
    var isTerminal: Bool { self == .completed || self == .cancelled }

    /// Position on the happy path, or `nil` for `cancelled`.
    var progressIndex: Int? { Self.lifecycle.firstIndex(of: self) }

    var messageKey: String {
        switch self {
        case .pending: "checkout.status.pending"
        case .confirmed: "checkout.status.confirmed"
        case .preparing: "checkout.status.preparing"
        case .ready: "checkout.status.ready"
        case .outForDelivery: "checkout.status.outForDelivery"
        case .completed: "checkout.status.completed"
        case .cancelled: "checkout.status.cancelled"
        }
    }

    var symbolName: String {
        switch self {
        case .pending: "clock"
        case .confirmed: "checkmark.seal"
        case .preparing: "frying.pan"
        case .ready: "takeoutbag.and.cup.and.straw"
        case .outForDelivery: "bicycle"
        case .completed: "checkmark.circle.fill"
        case .cancelled: "xmark.circle.fill"
        }
    }

    /// Whether the API would still allow the order to move forward.
    var isActive: Bool { !isTerminal }

    /// Mirrors the API's customer cancellation rule, which only accepts
    /// `pending`.
    ///
    /// This is a reflection of server state for affordances, never a decision:
    /// the cancel request is still refused server side when the order has moved
    /// on, and that refusal is what the app reports.
    var isCancellableByCustomer: Bool { self == .pending }
}

/// One recorded transition, as the API stored it.
///
/// The timestamp comes straight from the server's `statusHistory`, so the app
/// never invents a time for a step it did not witness.
struct OrderStatusEvent: Decodable, Hashable, Sendable, Identifiable {
    let status: OrderStatus
    let at: Date
    /// Set by the API for staff-driven transitions; `null` for system ones.
    let actorID: String?

    var id: String { "\(status.rawValue)-\(at.timeIntervalSince1970)" }
    var isSystemChange: Bool { actorID == nil }
}

/// ISO-8601 with or without fractional seconds, which is what the API emits.
enum OrderTimestamp {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: raw) { return date }
            let plain = ISO8601DateFormatter()
            plain.formatOptions = [.withInternetDateTime]
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognised date \(raw)")
        }
        return decoder
    }()
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
    let statusHistory: [OrderStatusEvent]
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, orderNumber, customerID, customer, address, branchID, items, currencyCode
        case subtotalMinor, deliveryFeeMinor, discountMinor, totalMinor, couponCode
        case payment, status, statusHistory, createdAt, updatedAt
    }

    /// Custom decoder for the two ISO timestamps, which the API always sends
    /// with milliseconds.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        orderNumber = try container.decode(String.self, forKey: .orderNumber)
        customerID = try container.decodeIfPresent(String.self, forKey: .customerID)
        customer = try container.decode(CheckoutCustomer.self, forKey: .customer)
        address = try container.decode(CheckoutAddress.self, forKey: .address)
        branchID = try container.decode(String.self, forKey: .branchID)
        items = try container.decode([PlacedOrderItem].self, forKey: .items)
        currencyCode = try container.decode(String.self, forKey: .currencyCode)
        subtotalMinor = try container.decode(Int.self, forKey: .subtotalMinor)
        deliveryFeeMinor = try container.decode(Int.self, forKey: .deliveryFeeMinor)
        discountMinor = try container.decode(Int.self, forKey: .discountMinor)
        totalMinor = try container.decode(Int.self, forKey: .totalMinor)
        couponCode = try container.decode(String.self, forKey: .couponCode)
        payment = try container.decode(OrderPayment.self, forKey: .payment)
        status = try container.decode(OrderStatus.self, forKey: .status)
        // Older records may predate the field; the current status is then the
        // only step that is genuinely known.
        statusHistory = try container.decodeIfPresent([OrderStatusEvent].self, forKey: .statusHistory) ?? []
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? createdAt
    }

    /// History ordered oldest first, which is how the timeline reads. The API
    /// returns them in that order already, so this only guards the display.
    var timeline: [OrderStatusEvent] {
        statusHistory.sorted { $0.at == $1.at
            ? ($0.status.progressIndex ?? .max) < ($1.status.progressIndex ?? .max)
            : $0.at < $1.at
        }
    }

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
/// One page of the customer's order history.
struct OrderPage: Equatable, Sendable {
    static let defaultLimit = 20
    let items: [PlacedOrder]
    /// `nil` when the API says there is nothing more to fetch.
    let nextCursor: String?

    var hasMore: Bool { nextCursor != nil }
}

/// Wire shape of `GET /customer/orders`, which wraps the page in the usual
/// `data`/`meta` envelope and decodes with the order timestamp strategy.
struct CustomerOrderPageDTO: Decodable {
    struct Meta: Decodable {
        let nextCursor: String?
    }
    let data: [PlacedOrder]
    let meta: Meta
}
