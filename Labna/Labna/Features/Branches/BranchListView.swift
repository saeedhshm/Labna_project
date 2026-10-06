import SwiftUI

struct BranchListView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        CatalogStateView(store: container.catalog) { snapshot in
            if snapshot.branches.isEmpty {
                LabnaEmptyStateView(
                    title: "branches.empty.title",
                    message: "branches.empty.message",
                    symbol: "mappin.slash"
                )
            } else {
                List(snapshot.branches) { branch in
                    NavigationLink {
                        BranchDetailView(branch: branch, language: container.settings.language)
                    } label: {
                        BranchRow(branch: branch, language: container.settings.language)
                    }
                    .accessibilityIdentifier("branch.\(branch.id)")
                    .listRowBackground(Color.white)
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle("branches.title")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct BranchRow: View {
    let branch: Branch
    let language: AppLanguage

    var body: some View {
        HStack(alignment: .top, spacing: LabnaSpacing.medium) {
            Image(systemName: "building.2.fill")
                .font(.title3)
                .foregroundStyle(Color.labnaGreen)
                .frame(width: 48, height: 48)
                .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: 14))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: LabnaSpacing.extraSmall) {
                HStack(alignment: .firstTextBaseline) {
                    Text(branch.name.value(for: language))
                        .font(LabnaTypography.headline)
                        .foregroundStyle(Color.labnaInk)
                }
                Text(branch.address.value(for: language))
                    .font(LabnaTypography.caption)
                    .foregroundStyle(Color.labnaMuted)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, LabnaSpacing.extraSmall)
    }
}
