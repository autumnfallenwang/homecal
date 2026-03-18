import Foundation
import SwiftUI

private let daysInGrid = 42

/// Returns 42 dates (6 rows × 7 cols) for a month grid starting on Monday.
public func monthGridDates(year: Int, month: Int) -> [Date] {
    let calendar = Calendar.current
    var comps = DateComponents(year: year, month: month, day: 1)
    guard let firstOfMonth = calendar.date(from: comps) else { return [] }

    // weekday: 1=Sun, 2=Mon … 7=Sat → shift so Mon=0
    let weekday = calendar.component(.weekday, from: firstOfMonth)
    let dayOfWeek = (weekday + 5) % 7

    comps.day = 1 - dayOfWeek
    guard let gridStart = calendar.date(from: comps) else { return [] }

    return (0..<daysInGrid).compactMap { offset in
        calendar.date(byAdding: .day, value: offset, to: gridStart)
    }
}

/// Returns 7 dates (Mon–Sun) for the week containing `date`.
public func weekDates(containing date: Date) -> [Date] {
    let calendar = Calendar.current
    let weekday = calendar.component(.weekday, from: date)
    let dayOfWeek = (weekday + 5) % 7
    guard let monday = calendar.date(byAdding: .day, value: -dayOfWeek, to: calendar.startOfDay(for: date)) else {
        return []
    }
    return (0..<7).compactMap { offset in
        calendar.date(byAdding: .day, value: offset, to: monday)
    }
}

public func isSameDay(_ lhs: Date, _ rhs: Date) -> Bool {
    Calendar.current.isDate(lhs, inSameDayAs: rhs)
}

public func isSameMonth(_ date: Date, year: Int, month: Int) -> Bool {
    let calendar = Calendar.current
    return calendar.component(.year, from: date) == year
        && calendar.component(.month, from: date) == month
}

public func isToday(_ date: Date) -> Bool {
    Calendar.current.isDateInToday(date)
}

public func formatMonthYear(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "MMMM yyyy"
    return formatter.string(from: date)
}

public func formatWeekRange(_ dates: [Date]) -> String {
    guard let first = dates.first, let last = dates.last else { return "" }
    let calendar = Calendar.current
    let monthShort = DateFormatter()
    monthShort.dateFormat = "MMM"

    let firstDay = calendar.component(.day, from: first)
    let lastDay = calendar.component(.day, from: last)
    let year = calendar.component(.year, from: last)

    if calendar.component(.month, from: first) == calendar.component(.month, from: last) {
        return "\(monthShort.string(from: first)) \(firstDay) – \(lastDay), \(year)"
    }
    return "\(monthShort.string(from: first)) \(firstDay) – \(monthShort.string(from: last)) \(lastDay), \(year)"
}

public func formatHour(_ hour: Int) -> String {
    if hour == 0 { return "12 AM" }
    if hour < 12 { return "\(hour) AM" }
    if hour == 12 { return "12 PM" }
    return "\(hour - 12) PM"
}

extension Color {
    /// Creates a Color from a hex string like "#3b82f6".
    public init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let red, green, blue: Double
        switch hex.count {
        case 6:
            red = Double((int >> 16) & 0xFF) / 255
            green = Double((int >> 8) & 0xFF) / 255
            blue = Double(int & 0xFF) / 255
        default:
            red = 0; green = 0; blue = 0
        }
        self.init(red: red, green: green, blue: blue)
    }
}
