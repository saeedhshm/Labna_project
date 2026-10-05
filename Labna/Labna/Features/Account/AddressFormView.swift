import SwiftUI

/// Native `Form` for adding or editing a saved address, validated against the
/// same limits as the `customerAddressInput` contract before the request is
/// sent, and showing API failures without losing what was typed.
struct AddressFormView: View {
    let mode: AddressFormMode

    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var draft: AddressFormDraft
    @State private var didValidate = false
    @FocusState private var focusedField: AddressFormField?
    @Environment(\.layoutDirection) private var layoutDirection

    init(mode: AddressFormMode, customer: Customer?) {
        self.mode = mode
        switch mode {
        case .add:
            _draft = State(initialValue: AddressFormDraft(customer: customer))
        case .edit(let address):
            _draft = State(initialValue: AddressFormDraft(address: address))
        }
    }

    private var store: AddressesStore {
        container.addresses
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error = store.lastError {
                    Section {
                        Label(LocalizedStringKey(error.messageKey), systemImage: "exclamationmark.circle")
                            .font(LabnaTypography.caption)
                            .foregroundStyle(.red)
                            .accessibilityIdentifier("addresses.form.error")
                    }
                }

                Section("addresses.section.details") {
                    field(.label, "addresses.label", text: $draft.label)
                    field(.city, "addresses.city", text: $draft.city)
                    field(.area, "addresses.area", text: $draft.area)
                    field(.street, "addresses.street", text: $draft.street)
                    field(.building, "addresses.building", text: $draft.building)
                    field(.floor, "addresses.floor", text: $draft.floor)
                    field(.apartment, "addresses.apartment", text: $draft.apartment)
                }

                Section("addresses.section.contact") {
                    field(.recipientName, "addresses.recipientName", text: $draft.recipientName, contentType: .name)
                    field(
                        .phoneNumber,
                        "addresses.phoneNumber",
                        text: $draft.phoneNumber,
                        contentType: .telephoneNumber,
                        keyboard: .phonePad,
                        isLatin: true
                    )
                }

                Section("addresses.section.notes") {
                    TextField("addresses.notes", text: $draft.notes, axis: .vertical)
                        .lineLimit(3...6)
                        .focused($focusedField, equals: .notes)
                        .accessibilityIdentifier("addresses.field.notes")
                    if let error = errorKey(for: .notes) {
                        errorLabel(error, field: "notes")
                    }
                }

                Section {
                    Toggle("addresses.makeDefault", isOn: $draft.isDefault)
                        .accessibilityIdentifier("addresses.field.isDefault")
                } footer: {
                    Text("addresses.makeDefaultHint")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollContentBackground(.hidden)
            .background(Color.labnaCream.opacity(0.45))
            .navigationTitle(mode.titleKey)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("addresses.cancel") { dismiss() }
                        .accessibilityIdentifier("addresses.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        save()
                    } label: {
                        if store.isSaving {
                            ProgressView().tint(.labnaGreen)
                        } else {
                            Text("addresses.save")
                        }
                    }
                    .disabled(store.isSaving)
                    .accessibilityIdentifier("addresses.save")
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("addresses.kbDone") { focusedField = nil }
                }
            }
            .onChange(of: container.auth.isAuthenticated) { _, isAuthenticated in
                if !isAuthenticated {
                    dismiss()
                }
            }
        }
    }

    @ViewBuilder
    private func field(
        _ field: AddressFormField,
        _ title: LocalizedStringKey,
        text: Binding<String>,
        contentType: UITextContentType? = nil,
        keyboard: UIKeyboardType = .default,
        isLatin: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
            TextField(title, text: text)
                .textContentType(contentType)
                .keyboardType(keyboard)
                .textInputAutocapitalization(isLatin || keyboard == .phonePad ? .never : .sentences)
                .autocorrectionDisabled()
                .focused($focusedField, equals: field)
                // Phone numbers stay LTR inside an otherwise RTL layout.
                .environment(\.layoutDirection, isLatin ? .leftToRight : layoutDirection)
                .accessibilityIdentifier("addresses.field.\(field.rawValue)")
            if let error = errorKey(for: field) {
                errorLabel(error, field: field.rawValue)
            }
        }
    }

    private func errorLabel(_ key: String, field: String) -> some View {
        Label(LocalizedStringKey(key), systemImage: "exclamationmark.circle")
            .font(LabnaTypography.caption)
            .foregroundStyle(.red)
            .accessibilityIdentifier("addresses.field.\(field).error")
    }

    private func errorKey(for field: AddressFormField) -> String? {
        guard didValidate else { return nil }
        return draft.validationErrors()[field]
    }

    private func save() {
        didValidate = true
        focusedField = nil
        guard draft.isValid else { return }
        let input = draft.input()
        Task {
            let succeeded: Bool
            switch mode {
            case .add:
                succeeded = await store.add(input)
            case .edit(let address):
                succeeded = await store.update(id: address.id, input: input)
            }
            if succeeded {
                dismiss()
            }
        }
    }
}

#Preview("Add") {
    NavigationStack { AddressFormView(mode: .add, customer: nil) }
        .environment(AppContainer.preview(language: .english))
}
