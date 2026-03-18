import SwiftUI

private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
private let maxVisiblePills = 3
private let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

struct MonthGridView: View {
    @Bindable var viewModel: CalendarViewModel

    private var eventsByDay: [String: [CalendarEvent]] {
        var map: [String: [CalendarEvent]] = [:]
        for event in viewModel.filteredEvents {
            let key = dayKey(event.start)
            map[key, default: []].append(event)
        }
        return map
    }

    private var memberColorMap: [String: String] {
        Dictionary(uniqueKeysWithValues: viewModel.members.map { ($0.id, $0.color) })
    }

    var body: some View {
        VStack(spacing: 0) {
            // Day-of-week header
            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(dayNames, id: \.self) { name in
                    Text(name)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
            }
            .background(Color(.systemBackground))

            Divider()

            // Day cells
            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(viewModel.currentMonthGridDates, id: \.self) { date in
                    MonthDayCellView(
                        date: date,
                        events: eventsByDay[dayKey(date)] ?? [],
                        memberColorMap: memberColorMap,
                        isCurrentMonth: isSameMonth(
                            date,
                            year: viewModel.currentYear,
                            month: viewModel.currentMonth
                        ),
                        onTapDay: { viewModel.tapDay(date) },
                        onTapEvent: { viewModel.tapEvent(id: $0) }
                    )
                }
            }
        }
    }
}

private func dayKey(_ date: Date) -> String {
    let cal = Calendar.current
    return "\(cal.component(.year, from: date))-\(cal.component(.month, from: date))-\(cal.component(.day, from: date))"
}

private struct MonthDayCellView: View {
    let date: Date
    let events: [CalendarEvent]
    let memberColorMap: [String: String]
    let isCurrentMonth: Bool
    let onTapDay: () -> Void
    let onTapEvent: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            // Day number
            Button(action: onTapDay) {
                Text("\(Calendar.current.component(.day, from: date))")
                    .font(.caption)
                    .fontWeight(isToday(date) ? .bold : .regular)
                    .foregroundStyle(
                        isToday(date) ? AnyShapeStyle(.white) :
                            isCurrentMonth ? AnyShapeStyle(.primary) : AnyShapeStyle(.tertiary)
                    )
                    .frame(width: 22, height: 22)
                    .background(isToday(date) ? Color.accentColor : .clear)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)

            // Event pills
            let visible = Array(events.prefix(maxVisiblePills))
            ForEach(visible, id: \.id) { event in
                let color = Color(hex: memberColorMap[event.ownerId] ?? "#6b7280")
                EventPillView(title: event.title, color: color) {
                    onTapEvent(event.id)
                }
            }

            if events.count > maxVisiblePills {
                Text("+\(events.count - maxVisiblePills) more")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(2)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
        .background(Color(.systemBackground))
        .overlay(
            Rectangle()
                .stroke(Color(.separator).opacity(0.3), lineWidth: 0.5)
        )
    }
}
