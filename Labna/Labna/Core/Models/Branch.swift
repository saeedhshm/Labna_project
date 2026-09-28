import Foundation

struct Branch: Codable, Identifiable, Hashable {
    struct Coordinate: Codable, Hashable {
        let latitude: Double
        let longitude: Double
    }

    struct OpeningHours: Codable, Hashable {
        // ISO weekday: Monday = 1 ... Sunday = 7. Local 24-hour HH:mm times.
        let weekday: Int
        let opensAt: String
        let closesAt: String
    }

    let id: String
    let name: LocalizedText
    let address: LocalizedText
    let coordinate: Coordinate
    let timeZoneIdentifier: String
    let openingHours: [OpeningHours]
    let phoneNumber: String?
    let isDemo: Bool
}
