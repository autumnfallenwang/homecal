import Foundation
import SwiftUI

public enum CalendarViewMode: String, CaseIterable {
    case month = "Month"
    case week = "Week"
}

@Observable
public final class CalendarViewModel: @unchecked Sendable {
    public var currentDate = Date()
    public var viewMode: CalendarViewMode = .month
    public var events: [CalendarEvent] = []
    public var members: [Member] = []
    public var visibleMemberIds: Set<String> = []
    public var isLoading = false

    // Task 18 hooks
    public var selectedEventId: String?
    public var selectedNewEventDate: Date?

    private var apiClient: APIClient?

    public init() {}

    public func configure(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    // MARK: - Computed

    public var filteredEvents: [CalendarEvent] {
        events.filter { visibleMemberIds.contains($0.ownerId) }
    }

    public var currentMonthGridDates: [Date] {
        let calendar = Calendar.current
        return monthGridDates(
            year: calendar.component(.year, from: currentDate),
            month: calendar.component(.month, from: currentDate)
        )
    }

    public var currentWeekDates: [Date] {
        weekDates(containing: currentDate)
    }

    public var title: String {
        switch viewMode {
        case .month:
            return formatMonthYear(currentDate)
        case .week:
            return formatWeekRange(currentWeekDates)
        }
    }

    public var currentYear: Int {
        Calendar.current.component(.year, from: currentDate)
    }

    public var currentMonth: Int {
        Calendar.current.component(.month, from: currentDate)
    }

    // MARK: - Navigation

    public func goForward() {
        let calendar = Calendar.current
        switch viewMode {
        case .month:
            currentDate = calendar.date(byAdding: .month, value: 1, to: currentDate) ?? currentDate
        case .week:
            currentDate = calendar.date(byAdding: .weekOfYear, value: 1, to: currentDate) ?? currentDate
        }
    }

    public func goBackward() {
        let calendar = Calendar.current
        switch viewMode {
        case .month:
            currentDate = calendar.date(byAdding: .month, value: -1, to: currentDate) ?? currentDate
        case .week:
            currentDate = calendar.date(byAdding: .weekOfYear, value: -1, to: currentDate) ?? currentDate
        }
    }

    public func toggleMember(id: String) {
        if visibleMemberIds.contains(id) {
            visibleMemberIds.remove(id)
        } else {
            visibleMemberIds.insert(id)
        }
    }

    public func tapDay(_ date: Date) {
        selectedNewEventDate = date
    }

    public func tapEvent(id: String) {
        selectedEventId = id
    }

    // MARK: - Data Loading

    public func loadData() async {
        guard let apiClient else { return }
        isLoading = true
        defer { isLoading = false }

        let gridDates: [Date]
        switch viewMode {
        case .month:
            gridDates = currentMonthGridDates
        case .week:
            gridDates = currentWeekDates
        }

        guard let gridStart = gridDates.first, let gridLast = gridDates.last else { return }
        let calendar = Calendar.current
        guard let gridEnd = calendar.date(byAdding: .day, value: 1, to: gridLast) else { return }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let fromStr = formatter.string(from: gridStart)
        let toStr = formatter.string(from: gridEnd)

        do {
            async let fetchedEvents = apiClient.fetchEvents(from: fromStr, to: toStr)
            async let fetchedMembers = apiClient.fetchMembers()

            let (newEvents, newMembers) = try await (fetchedEvents, fetchedMembers)
            events = newEvents
            members = newMembers

            if visibleMemberIds.isEmpty {
                visibleMemberIds = Set(newMembers.map(\.id))
            }
        } catch {
            print("CalendarViewModel.loadData error: \(error)")
        }
    }
}
