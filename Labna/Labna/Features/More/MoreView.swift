import SwiftUI

struct MoreView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        @Bindable var settings = container.settings

        List {
            Section {
                VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
                    LabnaLogo()
                    Text("more.intro")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                }
                .padding(.vertical, LabnaSpacing.small)
            }

            Section("more.language") {
                Picker("more.language", selection: $settings.language) {
                    ForEach(AppLanguage.allCases) { language in
                        Text(language.titleKey).tag(language)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.labnaCream.opacity(0.55))
            }

            Section("more.explore") {
                NavigationLink {
                    AboutLabnaView()
                } label: {
                    MoreRow(title: "more.aboutLabna", symbol: "drop")
                }
                .accessibilityIdentifier("more.about")

                NavigationLink {
                    BranchListView()
                } label: {
                    MoreRow(title: "more.branches", symbol: "mappin.and.ellipse")
                }
                .accessibilityIdentifier("more.branches")

                NavigationLink {
                    ContactView()
                } label: {
                    MoreRow(title: "more.contact", symbol: "bubble.left.and.bubble.right")
                }
                .accessibilityIdentifier("more.contact")
            }

            Section("more.demo.section") {
                Label {
                    Text("more.demo.message")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                } icon: {
                    Image(systemName: "testtube.2")
                        .foregroundStyle(Color.labnaGreen)
                }
                .accessibilityIdentifier("more.demoNotice")
            }

            Section {
                LabeledContent("more.version", value: appVersion)
                    .foregroundStyle(Color.labnaMuted)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle("more.title")
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "-"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        guard let build, build != version else { return version }
        return "\(version) (\(build))"
    }
}

private struct MoreRow: View {
    let title: LocalizedStringKey
    let symbol: String

    var body: some View {
        Label {
            Text(title).foregroundStyle(Color.labnaInk)
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(Color.labnaGreen)
                .frame(width: 28)
        }
    }
}
