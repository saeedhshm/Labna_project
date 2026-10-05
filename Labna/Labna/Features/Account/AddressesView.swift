import SwiftUI

/// Lists the signed-in customer's saved addresses and offers the full set of
/// management actions: add, edit, delete (with confirmation) and set default.
struct AddressesView: View {
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var formMode: AddressFormMode?
    @State private var pendingDelete: CustomerAddress?
    @State private var isConfirmingDelete = false

    private var store: AddressesStore {
        container.addresses
    }

    var body: some View {
        content
            .navigationTitle("addresses.title")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        openForm(.add)
                    } label: {
                        Label("addresses.add", systemImage: "plus")
                    }
                    .accessibilityIdentifier("addresses.add")
                }
            }
            .sheet(item: $formMode) { mode in
                AddressFormView(mode: mode, customer: container.auth.customer)
            }
            .confirmationDialog(
                "addresses.delete.confirmTitle",
                isPresented: $isConfirmingDelete,
                presenting: pendingDelete
            ) { address in
                Button("addresses.delete.confirmAction", role: .destructive) {
                    Task { await store.delete(id: address.id) }
                }
                Button("addresses.cancel", role: .cancel) {}
            } message: { _ in
                Text("addresses.delete.confirmMessage")
            }
            .task {
                await store.loadIfNeeded()
            }
            .task(id: store.notice) {
                guard store.notice != nil else { return }
                try? await Task.sleep(for: .seconds(4))
                store.clearNotice()
            }
            .onChange(of: container.auth.isAuthenticated) { _, isAuthenticated in
                if !isAuthenticated {
                    dismiss()
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        if store.isEmpty {
            emptyState
        } else {
            list
        }
    }

    private func openForm(_ mode: AddressFormMode) {
        store.clearError()
        formMode = mode
    }

    @ViewBuilder
    private var emptyState: some View {
        switch store.phase {
        case .failed(let error):
            LabnaErrorStateView(message: LocalizedStringKey(error.messageKey)) {
                Task { await store.load() }
            }
            .accessibilityIdentifier("addresses.error")
        case .loaded:
            LabnaEmptyStateView(
                title: "addresses.empty.title",
                message: "addresses.empty.message",
                symbol: "mappin.slash",
                actionTitle: "addresses.add",
                action: { openForm(.add) }
            )
            .accessibilityIdentifier("addresses.empty")
        case .idle, .loading:
            LabnaLoadingView(title: "addresses.loading")
        }
    }

    private var list: some View {
        List {
            if let notice = store.notice {
                Section {
                    Label(LocalizedStringKey(notice), systemImage: "checkmark.circle.fill")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaGreen)
                        .accessibilityIdentifier("addresses.notice")
                }
                .listRowBackground(Color.labnaMint)
            }

            if let error = store.lastError {
                Section {
                    Label(LocalizedStringKey(error.messageKey), systemImage: "exclamationmark.circle")
                        .font(LabnaTypography.body)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("addresses.error")
                }
            }

            Section {
                ForEach(store.addresses) { address in
                    AddressRow(
                        address: address,
                        isBusy: store.isDeleting(address.id) || store.isSettingDefault(address.id),
                        fallbackRecipient: container.auth.customer?.name ?? "",
                        fallbackPhone: container.auth.customer?.phoneNumber ?? "",
                        onEdit: { openForm(.edit(address)) },
                        onSetDefault: {
                            store.clearError()
                            Task { await store.setDefault(id: address.id) }
                        },
                        onDelete: {
                            store.clearError()
                            pendingDelete = address
                            isConfirmingDelete = true
                        }
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.labnaCream.opacity(0.45))
        .refreshable {
            await store.load()
        }
    }
}

private struct AddressRow: View {
    let address: CustomerAddress
    let isBusy: Bool
    let fallbackRecipient: String
    let fallbackPhone: String
    let onEdit: () -> Void
    let onSetDefault: () -> Void
    let onDelete: () -> Void

    private var recipient: String {
        let name = address.recipientName?.isEmpty == false ? (address.recipientName ?? "") : fallbackRecipient
        let phone = address.phoneNumber?.isEmpty == false ? (address.phoneNumber ?? "") : fallbackPhone
        return [name, phone].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var location: String {
        [address.city, address.area, address.street, address.building]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    private var details: String {
        [address.floor, address.apartment, address.notes]
            .compactMap { $0 }
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            HStack(spacing: LabnaSpacing.small) {
                Text(address.label)
                    .font(LabnaTypography.headline)
                    .foregroundStyle(Color.labnaInk)
                if address.isDefault {
                    Label("addresses.default", systemImage: "checkmark.seal.fill")
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.labnaGreen)
                        .labelStyle(.titleAndIcon)
                        .padding(.horizontal, LabnaSpacing.small)
                        .padding(.vertical, LabnaSpacing.extraSmall)
                        .background(Color.labnaMint, in: Capsule())
                        .accessibilityIdentifier("addresses.defaultBadge")
                }
                Spacer(minLength: 0)
            }

            if !recipient.isEmpty {
                Text(recipient)
                    .font(LabnaTypography.body)
                    .foregroundStyle(Color.labnaMuted)
            }
            if !location.isEmpty {
                Text(location)
                    .font(LabnaTypography.body)
                    .foregroundStyle(Color.labnaInk)
            }
            if !details.isEmpty {
                Text(details)
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
            }

            if isBusy {
                ProgressView()
                    .accessibilityLabel(Text("data.loading"))
                    .accessibilityIdentifier("addresses.row.busy")
            } else {
                HStack(spacing: LabnaSpacing.medium) {
                    Button("addresses.edit", action: onEdit)
                        .accessibilityIdentifier("addresses.row.edit")

                    Button("addresses.setDefault", action: onSetDefault)
                        .disabled(address.isDefault)
                        .accessibilityIdentifier("addresses.row.setDefault")

                    Button("addresses.delete", role: .destructive, action: onDelete)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("addresses.row.delete")
                }
                .buttonStyle(.borderless)
                .font(LabnaTypography.caption)
                .controlSize(.small)
            }
        }
        .padding(.vertical, LabnaSpacing.extraSmall)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("addresses.row.\(address.id)")
    }
}

/// Add or edit presentation for the address form sheet.
enum AddressFormMode: Identifiable, Equatable {
    case add
    case edit(CustomerAddress)

    var id: String {
        switch self {
        case .add: "add"
        case .edit(let address): address.id
        }
    }

    var titleKey: LocalizedStringKey {
        switch self {
        case .add: "addresses.form.addTitle"
        case .edit: "addresses.form.editTitle"
        }
    }
}

#Preview("Empty") {
    NavigationStack { AddressesView() }
        .environment(AppContainer.preview(language: .english))
}

#Preview("Arabic") {
    NavigationStack { AddressesView() }
        .environment(AppContainer.preview(language: .arabic))
}
