import Foundation
@testable import HomeCalKit
import SwiftUI
import Testing

@Suite("CalendarUtils")
struct CalendarUtilsTests {

    @Test func monthGridDates_returns42Dates() {
        let dates = monthGridDates(year: 2026, month: 3) // March 2026
        #expect(dates.count == 42)
    }

    @Test func monthGridDates_startsOnMonday() {
        let dates = monthGridDates(year: 2026, month: 3)
        let weekday = Calendar.current.component(.weekday, from: dates[0])
        // 2=Monday in Calendar's weekday
        #expect(weekday == 2)
    }

    @Test func monthGridDates_differentMonth() {
        // January 2026 starts on Thursday
        let dates = monthGridDates(year: 2026, month: 1)
        #expect(dates.count == 42)
        let weekday = Calendar.current.component(.weekday, from: dates[0])
        #expect(weekday == 2) // Grid always starts Monday
    }

    @Test func weekDates_returns7Days_mondayToSunday() throws {
        // Pick a Wednesday: 2026-03-18
        let comps = DateComponents(year: 2026, month: 3, day: 18)
        let wednesday = try #require(Calendar.current.date(from: comps))
        let dates = weekDates(containing: wednesday)

        #expect(dates.count == 7)

        // First should be Monday
        let firstWeekday = Calendar.current.component(.weekday, from: dates[0])
        #expect(firstWeekday == 2) // Monday

        // Last should be Sunday
        let lastWeekday = Calendar.current.component(.weekday, from: dates[6])
        #expect(lastWeekday == 1) // Sunday
    }

    @Test func isSameDay_works() throws {
        let cal = Calendar.current
        var comps = DateComponents(year: 2026, month: 3, day: 17, hour: 10)
        let morning = try #require(cal.date(from: comps))
        comps.hour = 22
        let evening = try #require(cal.date(from: comps))
        comps.day = 18
        let nextDay = try #require(cal.date(from: comps))

        #expect(isSameDay(morning, evening) == true)
        #expect(isSameDay(morning, nextDay) == false)
    }

    @Test func isToday_works() {
        #expect(HomeCalKit.isToday(Date()) == true)

        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())
        if let yesterday {
            #expect(HomeCalKit.isToday(yesterday) == false)
        }
    }

    @Test func formatMonthYear_works() throws {
        let comps = DateComponents(year: 2026, month: 3, day: 1)
        let date = try #require(Calendar.current.date(from: comps))
        let result = formatMonthYear(date)
        #expect(result == "March 2026")
    }

    @Test func colorHexParsing() {
        _ = Color(hex: "#3b82f6")
        _ = Color(hex: "3b82f6")
        _ = Color(hex: "#000000")
        _ = Color(hex: "#ffffff")
        // If we get here without crashing, the test passes
    }
}
