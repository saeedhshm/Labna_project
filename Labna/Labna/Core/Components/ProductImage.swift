import SwiftUI
import NukeUI

/// Nuke's shared pipeline provides memory caching and HTTP URLCache support.
/// The aspect ratio stays fixed for loading, success and failure.
struct ProductImage: View {
    let url: URL?
    var aspectRatio: CGFloat = 1
    var allowsRetry = true
    @State private var retryID = UUID()

    var body: some View {
        Color.labnaCream
            .aspectRatio(aspectRatio, contentMode: .fit)
            .overlay {
                GeometryReader { geometry in
                    if simulatesFailure {
                        failureContent(in: geometry.size, canRetry: allowsRetry)
                    } else {
                        LazyImage(url: url) { state in
                            if let image = state.image {
                                image.resizable().scaledToFill()
                                    .frame(width: geometry.size.width, height: geometry.size.height)
                                    .clipped()
                                    .accessibilityHidden(true)
                            } else if state.error != nil || url == nil {
                                failureContent(in: geometry.size, canRetry: url != nil && allowsRetry)
                            } else {
                                ProgressView("image.loading")
                                    .frame(width: geometry.size.width, height: geometry.size.height)
                            }
                        }
                        .id(retryID)
                    }
                }
            }
            .clipped()
    }

    private func failureContent(in size: CGSize, canRetry: Bool) -> some View {
        VStack(spacing: LabnaSpacing.small) {
            Image(systemName: "photo")
                .accessibilityHidden(true)
            if canRetry {
                Button("data.retry") { retryID = UUID() }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("image.retry")
            } else {
                Text("image.unavailable")
                    .font(LabnaTypography.caption)
            }
        }
        .foregroundStyle(Color.labnaGreen)
        .frame(width: size.width, height: size.height)
    }

    private var simulatesFailure: Bool {
#if DEBUG
        ProcessInfo.processInfo.arguments.contains("-simulateImageFailure")
#else
        false
#endif
    }
}

#Preview {
    ProductImage(url: nil)
        .frame(width: 180)
}
