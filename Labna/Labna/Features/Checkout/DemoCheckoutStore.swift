import Foundation
import Observation

enum DemoCheckoutError: Equatable {
    case emptyCart
    case unavailableItems
    case inconsistentCurrency

    var messageKey: String {
        switch self {
        case .emptyCart: "checkout.error.empty"
        case .unavailableItems: "checkout.error.unavailable"
        case .inconsistentCurrency: "checkout.error.currency"
        }
    }
}

@MainActor
@Observable
final class DemoCheckoutStore {
    private(set) var isProcessing = false
    private(set) var error: DemoCheckoutError?
    private let processingDelay: Duration

    init(processingDelay: Duration = .milliseconds(450)) {
        self.processingDelay = processingDelay
    }

    func confirm(cart: CartStore, notes: String) async -> DemoOrder? {
        guard !isProcessing else { return nil }
        error = nil
        guard !cart.items.isEmpty else {
            error = .emptyCart
            return nil
        }
        guard cart.lines.count == cart.items.count,
              cart.lines.allSatisfy(\.isAvailable) else {
            error = .unavailableItems
            return nil
        }
        let currencies = Set(cart.lines.compactMap { $0.variant?.currencyCode })
        guard currencies.count == 1 else {
            error = .inconsistentCurrency
            return nil
        }

        isProcessing = true
        defer { isProcessing = false }
        do {
            try await Task.sleep(for: processingDelay)
            try Task.checkCancellation()
        } catch {
            return nil
        }

        // Revalidate after the simulated processing interval.
        guard cart.lines.count == cart.items.count,
              !cart.lines.isEmpty,
              cart.lines.allSatisfy(\.isAvailable) else {
            error = .unavailableItems
            return nil
        }
        let currentCurrencies = Set(cart.lines.compactMap { $0.variant?.currencyCode })
        guard currentCurrencies.count == 1, let currency = currentCurrencies.first else {
            error = .inconsistentCurrency
            return nil
        }
        let lines = cart.lines.compactMap { line -> DemoOrder.Line? in
            guard let product = line.product,
                  let variant = line.variant,
                  let currentPrice = line.currentUnitPriceMinor else { return nil }
            return DemoOrder.Line(
                productID: product.id,
                variantID: variant.id,
                productName: product.name,
                variantLabel: variant.label,
                unitPriceMinor: currentPrice,
                quantity: line.item.quantity
            )
        }
        guard lines.count == cart.lines.count else {
            error = .unavailableItems
            return nil
        }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let order = DemoOrder(
            id: Self.reference(),
            createdAt: .now,
            currencyCode: currency,
            lines: lines,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes
        )
        cart.removeAll()
        return order
    }

    private static func reference() -> String {
        let timestamp = Int(Date().timeIntervalSince1970)
        let suffix = UUID().uuidString.prefix(4).uppercased()
        return "DEMO-\(timestamp)-\(suffix)"
    }
}
