import MapKit
import SwiftUI

struct BranchDetailView: View {
    let branch: Branch
    let language: AppLanguage
    @State private var mapPosition: MapCameraPosition

    init(branch: Branch, language: AppLanguage) {
        self.branch = branch
        self.language = language
        let center = CLLocationCoordinate2D(
            latitude: branch.coordinate.latitude,
            longitude: branch.coordinate.longitude
        )
        _mapPosition = State(initialValue: .region(MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.035, longitudeDelta: 0.035)
        )))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                if branch.isDemo { demoNotice }
                locationCard
                openingHours
                contactCard
            }
            .padding(LabnaSpacing.large)
        }
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle(branch.name.value(for: language))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(
            latitude: branch.coordinate.latitude,
            longitude: branch.coordinate.longitude
        )
    }

    private var demoNotice: some View {
        Label {
            Text("branches.demoMessage").font(LabnaTypography.body)
        } icon: {
            Image(systemName: "testtube.2")
        }
        .foregroundStyle(Color.labnaGreen)
        .padding(LabnaSpacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.labnaMint, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
        .accessibilityIdentifier("branch.demoNotice")
    }

    private var locationCard: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Text("branches.location").font(LabnaTypography.brand).foregroundStyle(Color.labnaInk)
            Map(position: $mapPosition, interactionModes: [.pan, .zoom]) {
                Marker(branch.name.value(for: language), coordinate: coordinate)
                    .tint(Color.labnaGreen)
            }
            .mapStyle(.standard(elevation: .flat))
            .frame(height: 250)
            .clipShape(RoundedRectangle(cornerRadius: LabnaRadius.medium))
            .accessibilityIdentifier("branch.map")

            Label(branch.address.value(for: language), systemImage: "mappin")
                .font(LabnaTypography.body)
                .foregroundStyle(Color.labnaMuted)

            Button("branches.directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill") {
                openDirections()
            }
            .buttonStyle(.labnaPrimary)
            .accessibilityIdentifier("branch.directions")
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private var openingHours: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.medium) {
            Label("branches.hours", systemImage: "clock")
                .font(LabnaTypography.brand)
                .foregroundStyle(Color.labnaInk)
            ForEach(branch.openingHours.sorted { $0.weekday < $1.weekday }, id: \.weekday) { hours in
                HStack {
                    Text(weekdayKey(hours.weekday))
                    Spacer()
                    Text("\(formattedTime(hours.opensAt)) – \(formattedTime(hours.closesAt))")
                        .foregroundStyle(Color.labnaMuted)
                        .monospacedDigit()
                }
                .font(LabnaTypography.body)
                if hours.weekday != branch.openingHours.map(\.weekday).max() { Divider() }
            }
        }
        .padding(LabnaSpacing.medium)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private var contactCard: some View {
        VStack(alignment: .leading, spacing: LabnaSpacing.small) {
            Label("branches.contact", systemImage: "phone")
                .font(LabnaTypography.brand)
                .foregroundStyle(Color.labnaInk)
            if let phoneURL, let phoneNumber = branch.phoneNumber {
                Link(destination: phoneURL) {
                    Label(phoneNumber, systemImage: "phone.fill")
                }
                .buttonStyle(.labnaSecondary)
                .accessibilityIdentifier("branch.call")
            } else {
                Text("branches.phoneUnavailable")
                    .font(LabnaTypography.body)
                    .foregroundStyle(Color.labnaMuted)
            }
        }
        .padding(LabnaSpacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.large))
        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.large).stroke(Color.labnaBorder) }
    }

    private var phoneURL: URL? {
        guard !branch.isDemo, let phone = branch.phoneNumber else { return nil }
        let allowed = phone.filter { $0.isNumber || $0 == "+" }
        guard !allowed.isEmpty else { return nil }
        return URL(string: "tel:\(allowed)")
    }

    private func openDirections() {
        let destination = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        destination.name = branch.name.value(for: language)
        destination.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ])
    }

    private func formattedTime(_ value: String) -> String {
        let pieces = value.split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2,
              let date = Calendar(identifier: .gregorian).date(
                from: DateComponents(year: 2000, month: 1, day: 1, hour: pieces[0], minute: pieces[1])
              ) else { return value }
        return date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(language.locale))
    }

    private func weekdayKey(_ weekday: Int) -> LocalizedStringKey {
        switch weekday {
        case 1: "weekday.monday"
        case 2: "weekday.tuesday"
        case 3: "weekday.wednesday"
        case 4: "weekday.thursday"
        case 5: "weekday.friday"
        case 6: "weekday.saturday"
        default: "weekday.sunday"
        }
    }
}
