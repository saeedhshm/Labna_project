import SwiftUI

struct LabnaSearchField: View {
    @Binding var text: String
    var prompt: LocalizedStringKey = "search.prompt"
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: LabnaSpacing.small) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.labnaMuted)
                .accessibilityHidden(true)
            TextField(prompt, text: $text)
                .focused($isFocused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.labnaMuted)
                }
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel("search.clear")
            }
        }
        .padding(.leading, LabnaSpacing.medium)
        .padding(.trailing, LabnaSpacing.extraSmall)
        .frame(minHeight: 52)
        .background(Color.labnaCream.opacity(0.65), in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .overlay {
            RoundedRectangle(cornerRadius: LabnaRadius.medium)
                .stroke(isFocused ? Color.labnaGreen : Color.labnaBorder, lineWidth: isFocused ? 1.5 : 1)
        }
        .accessibilityIdentifier("catalog.search")
    }
}
