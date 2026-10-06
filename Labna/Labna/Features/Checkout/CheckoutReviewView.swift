import SwiftUI

/// Real checkout: choose a saved delivery address, confirm contact details, pick
/// cash on delivery, optionally add a coupon, review the server's numbers, and
/// place the order through the API.
///
/// The screen never computes a payable total. It shows the server-validated
/// subtotal while reviewing, and the API's own subtotal, delivery fee, discount
/// and total once the order exists.
struct CheckoutReviewView: View {
    @Environment(AppContainer.self) private var container
    @State private var notes = ""
    @State private var placedOrder: PlacedOrder?
    @State private var didValidate = false

    private var checkout: CheckoutStore { container.checkout }
    private var language: AppLanguage { container.settings.language }
    private var validation: CartValidationStore { container.cartValidation }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                serverValidationNotice
                addressSection
                contactSection
                paymentSection
                couponSection
                orderLines
                notesField
                totals
                if let failure = checkout.failure {
                    failureLabel(failure)
                }
            }
            .padding(LabnaSpacing.large)
            .padding(.bottom, 96)
        }
        .background(Color.labnaCream.opacity(0.25))
        .navigationTitle("checkout.title")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            confirmButton
                .padding(LabnaSpacing.medium)
                .background(.ultraThinMaterial)
        }
        .navigationDestination(item: $placedOrder) { order in
            OrderSuccessView(order: order, language: language)
        }
        .task { await prepare() }
        .task(id: container.cart.items.count) { await confirmWithServer() }
        .onDisappear {
            // Leaving the screen must not leave a stale "submitting" state behind.
            if !checkout.isSubmitting { didValidate = false }
        }
    }

    // MARK: - Preparation

    private func prepare() async {
        checkout.prepare()
        await container.addresses.loadIfNeeded()
        await confirmWithServer()
    }

    /// Re-confirms the cart on entry so this screen can never be reached with a
    /// stale verdict or a cart that changed in the background.
    private func confirmWithServer() async {
        guard !container.cart.items.isEmpty else {
            container.cartValidation.reset()
            return
        }
        await container.cartValidation.validate()
    }

    // MARK: - Server state

    private func statusBanner(text: LocalizedStringKey, symbol: String, isGood: Bool) -> some View {
        Label(text, systemImage: symbol)
            .font(LabnaTypography.headline)
            .foregroundStyle(isGood ? Color.labnaGreen : Color.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LabnaSpacing.medium)
            .background(
                (isGood ? Color.labnaGreen : Color.orange).opacity(0.1),
                in: RoundedRectangle(cornerRadius: LabnaRadius.medium)
            )
    }

    /// States plainly whether the totals below came from the server, and blocks
    /// the order when the server reported a problem.
    private var serverValidationNotice: some View {
        Group {
            if validation.isValidating {
                statusBanner(text: "cart.validation.checking", symbol: "arrow.triangle.2.circlepath", isGood: false)
            } else if validation.isCheckoutReady {
                statusBanner(text: "cart.validation.ready", symbol: "checkmark.seal.fill", isGood: true)
            } else if let error = validation.lastError {
                statusBanner(
                    text: error.isOffline ? "cart.validation.offline" : "cart.validation.failed",
                    symbol: "wifi.exclamationmark",
                    isGood: false
                )
            } else if !validation.blockingItems.isEmpty {
                statusBanner(text: "cart.validation.blocked", symbol: "exclamationmark.octagon.fill", isGood: false)
            }
        }
        .accessibilityIdentifier("checkout.validation.notice")
    }

    private func failureLabel(_ failure: CheckoutFailure) -> some View {
        Label {
            VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                Text(LocalizedStringKey(failure.messageKey))
                    .font(LabnaTypography.body)
                if case .cartNotConfirmed(let reasons) = failure, let reason = reasons.first {
                    Label(reason.messageKey, systemImage: "cart")
                        .font(LabnaTypography.caption)
                }
                if case .rejected(let rejection) = failure,
                   case .insufficientStock(_, _, let available) = rejection,
                   let available {
                    Text("cart.availableUnits \(available)")
                        .font(LabnaTypography.caption)
                }
            }
        } icon: {
            Image(systemName: "exclamationmark.triangle.fill")
        }
        .foregroundStyle(Color.orange)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LabnaSpacing.medium)
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .accessibilityIdentifier("checkout.error")
    }

    // MARK: - Sections

    private var savedAddresses: [CustomerAddress] {
        container.auth.customer?.addresses ?? []
    }

    @ViewBuilder
    private var addressSection: some View {
        section(title: "checkout.address.title") {
            if savedAddresses.isEmpty {
                VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                    Text("checkout.address.empty")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                    Button("checkout.address.manage") { container.router.show(.more) }
                        .buttonStyle(.labnaSecondary)
                        .accessibilityIdentifier("checkout.address.manage")
                }
            } else {
                ForEach(savedAddresses) { address in
                    Button {
                        checkout.select(addressID: address.id)
                    } label: {
                        addressRow(address)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("checkout.address.\(address.id)")
                    if address.id != savedAddresses.last?.id { Divider() }
                }
            }
        }
    }

    private func addressRow(_ address: CustomerAddress) -> some View {
        let selected = checkout.selectedAddressID == address.id
        return HStack(alignment: .top, spacing: LabnaSpacing.medium) {
            Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                .foregroundStyle(selected ? Color.labnaGreen : Color.labnaMuted)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                HStack(spacing: LabnaSpacing.small) {
                    Text(address.label).font(LabnaTypography.headline)
                    if address.isDefault {
                        Text("addresses.default")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaGreen)
                            .padding(.horizontal, LabnaSpacing.small)
                            .background(Color.labnaMint, in: Capsule())
                    }
                }
                Text([address.city, address.area, address.street, address.building]
                    .filter { !$0.isEmpty }
                    .joined(separator: ", "))
                    .font(LabnaTypography.body)
                    .foregroundStyle(Color.labnaMuted)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    private var contactSection: some View {
        section(title: "checkout.contact.title") {
            contactField("checkout.contact.name", text: binding(.name), identifier: "checkout.contact.name")
            if let error = contactError(ProfileDraft.Field.name) { errorLabel(error, "name") }
            contactField("checkout.contact.phone", text: binding(.phoneNumber), identifier: "checkout.contact.phone", keyboard: .phonePad)
            if let error = contactError(ProfileDraft.Field.phoneNumber) { errorLabel(error, "phone") }
            contactField("checkout.contact.email", text: binding(.email), identifier: "checkout.contact.email", keyboard: .emailAddress)
            if let error = contactError(ProfileDraft.Field.email) { errorLabel(error, "email") }
        }
    }

    private var paymentSection: some View {
        section(title: "checkout.payment.title") {
            ForEach(PaymentMethod.storefrontChoices, id: \.self) { method in
                Button {
                    checkout.updatePaymentMethod(method)
                } label: {
                    HStack(spacing: LabnaSpacing.medium) {
                        Image(systemName: checkout.paymentMethod == method
                            ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(checkout.paymentMethod == method
                                ? Color.labnaGreen : Color.labnaMuted)
                            .accessibilityHidden(true)
                        Text(LocalizedStringKey(method.messageKey)).font(LabnaTypography.body)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("checkout.payment.\(method.rawValue)")
            }
        }
    }

    private var couponSection: some View {
        section(title: "checkout.coupon.title") {
            TextField("checkout.coupon.placeholder", text: couponBinding)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .accessibilityIdentifier("checkout.coupon.field")
            // The discount is decided by the server, so the field only promises
            // that a code was sent, never what it is worth.
            Text("checkout.coupon.hint")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
                .accessibilityIdentifier("checkout.coupon.hint")
        }
    }

    private var orderLines: some View {
        section(title: "checkout.products") {
            ForEach(container.cart.lines) { line in
                HStack(alignment: .top, spacing: LabnaSpacing.medium) {
                    ProductImage(url: validation.verdict(for: line.id)?.imageURL ?? line.product?.imageURLs.first)
                        .frame(width: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                        Text(name(for: line)).font(LabnaTypography.headline)
                        Text(variantLabel(for: line))
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                        Text("checkout.quantity \(line.item.quantity)")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(Color.labnaMuted)
                    }
                    Spacer()
                    if let subtotal = lineTotalMinor(for: line) {
                        PriceText(minorUnits: subtotal, currencyCode: currencyCode)
                    }
                }
                if line.id != container.cart.lines.last?.id { Divider() }
            }
        }
    }

    private var notesField: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            Text("checkout.notes").font(LabnaTypography.headline)
            TextEditor(text: $notes)
                .frame(minHeight: 90)
                .padding(LabnaSpacing.small)
                .scrollContentBackground(.hidden)
                .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
                .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
                .accessibilityIdentifier("checkout.notes")
            Text("checkout.notes.hint")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
        }
    }

    private var totals: some View {
        VStack(spacing: LabnaSpacing.small) {
            HStack {
                Text("cart.units")
                Spacer()
                Text(container.cart.totalQuantity.formatted()).monospacedDigit()
            }
            HStack(alignment: .firstTextBaseline) {
                Text("checkout.total.items").font(LabnaTypography.headline)
                Spacer()
                PriceText(minorUnits: subtotalMinor, currencyCode: currencyCode)
            }
            // Delivery and discounts only exist once the server has priced the
            // order, so they are confirmed on the success screen rather than
            // guessed at here.
            Text("checkout.total.pending")
                .font(LabnaTypography.caption)
                .foregroundStyle(Color.labnaMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("checkout.total.pending")
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
    }

    // MARK: - Bindings and helpers

    private func binding(_ field: ProfileDraft.Field) -> Binding<String> {
        Binding(
            get: { checkout.contact.value(for: field) },
            set: { value in
                checkout.updateContact(checkout.contact.updating(field, with: value))
                didValidate = true
            }
        )
    }

    private var couponBinding: Binding<String> {
        Binding(
            get: { checkout.couponCode },
            set: { checkout.updateCoupon($0) }
        )
    }

    private func contactError(_ field: ProfileDraft.Field) -> String? {
        guard didValidate else { return nil }
        return checkout.contact.validationErrors()[field]
    }

    private func errorLabel(_ key: String, _ field: String) -> some View {
        Label(LocalizedStringKey(key), systemImage: "exclamationmark.circle")
            .font(LabnaTypography.caption)
            .foregroundStyle(.red)
            .accessibilityIdentifier("checkout.contact.\(field).error")
    }

    private func contactField(
        _ title: LocalizedStringKey,
        text: Binding<String>,
        identifier: String,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        TextField(title, text: text)
            .keyboardType(keyboard)
            .textInputAutocapitalization(keyboard == .phonePad ? .never : .words)
            .autocorrectionDisabled(keyboard == .phonePad)
            .accessibilityIdentifier(identifier)
    }

    private func name(for line: CartLine) -> String {
        validation.verdict(for: line.id)?.productName.value(for: language)
            ?? (line.product?.name ?? line.item.productName).value(for: language)
    }

    private func variantLabel(for line: CartLine) -> String {
        validation.verdict(for: line.id)?.variantLabel.value(for: language)
            ?? (line.variant?.label ?? line.item.variantLabel).value(for: language)
    }

    private func lineTotalMinor(for line: CartLine) -> Int? {
        validation.verdict(for: line.id)?.lineTotalMinor ?? line.currentSubtotalMinor
    }

    private var currencyCode: String {
        validation.currencyCode ?? container.cart.currencyCode
    }

    private var subtotalMinor: Int {
        validation.subtotalMinor ?? container.cart.totalMinor
    }

    // MARK: - Submit

    private var confirmButton: some View {
        Button {
            guard !checkout.isSubmitting else { return }
            didValidate = true
            Task {
                // The store re-validates against the server immediately before
                // creating the order, so a cart that moved while the shopper was
                // reading cannot go through.
                if let order = await checkout.submit(notes: notes) {
                    placedOrder = order
                }
            }
        } label: {
            if checkout.isBusy {
                HStack {
                    ProgressView().tint(.white)
                    Text(checkout.isSubmitting ? "checkout.processing" : "checkout.checking")
                }
                .accessibilityIdentifier("checkout.busy")
            } else {
                Text("checkout.confirm")
            }
        }
        .buttonStyle(.labnaPrimary)
        .disabled(
            checkout.isBusy
                || container.cart.items.isEmpty
                || !validation.isCheckoutReady
        )
        .accessibilityIdentifier("checkout.confirm")
    }

    // MARK: - Section chrome

    private func section<Content: View>(title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text(title).font(LabnaTypography.brand).foregroundStyle(Color.labnaInk)
            content()
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }
}