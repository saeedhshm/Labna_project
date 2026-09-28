import SwiftUI

struct LabnaLoadingView: View {
    var title: LocalizedStringKey = "data.loading"

    var body: some View {
        VStack(spacing: LabnaSpacing.medium) {
            ProgressView().controlSize(.large).tint(.labnaGreen)
            Text(title).font(LabnaTypography.body).foregroundStyle(Color.labnaMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(LabnaSpacing.large)
        .accessibilityElement(children: .combine)
    }
}

struct LabnaEmptyStateView: View {
    let title: LocalizedStringKey
    let message: LocalizedStringKey
    var symbol = "shippingbox"
    var actionTitle: LocalizedStringKey?
    var action: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(message)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.labnaPrimary)
            }
        }
    }
}

struct LabnaErrorStateView: View {
    let message: LocalizedStringKey
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("data.error.title", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
        } description: {
            Text(message)
        } actions: {
            Button("data.retry", action: retry).buttonStyle(.labnaPrimary)
        }
    }
}
