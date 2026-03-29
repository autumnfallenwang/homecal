import SwiftUI

private let hourHeight: CGFloat = 48
private let hourCount = 24
private let scrollToHour = 7
private let gutterWidth: CGFloat = 44
private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

struct WeekGridView: View {
    @Bindable var viewModel: CalendarViewModel

    private var memberColorMap: [String: String] {
        Dictionary(uniqueKeysWithValues: viewModel.members.map { ($0.id, $0.color) })
    }

    private var eventsByDay: [String: [CalendarEvent]] {
        var map: [String: [CalendarEvent]] = [:]
        for event in viewModel.filteredEvents {
            let key = dayKey(event.start)
            map[key, default: []].append(event)
        }
        return map
    }

    var body: some View {
        VStack(spacing: 0) {
            // Day headers
            dayHeaderRow

            Divider()

            // Scrollable time grid
            ScrollView(.vertical) {
                ZStack(alignment: .topLeading) {
                    // Hour grid lines + gutter
                    hourGutter

                    // Day columns with events
                    HStack(spacing: 0) {
                        Color.clear.frame(width: gutterWidth)

                        ForEach(Array(viewModel.currentWeekDates.enumerated()), id: \.offset) { _, date in
                            dayColumn(for: date)
                        }
                    }
                }
                .frame(height: CGFloat(hourCount) * hourHeight)
            }
            .defaultScrollAnchor(
                UnitPoint(x: 0, y: CGFloat(scrollToHour) / CGFloat(hourCount))
            )
        }
    }

    // MARK: - Day Headers

    private var dayHeaderRow: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: gutterWidth)
            ForEach(Array(viewModel.currentWeekDates.enumerated()), id: \.offset) { idx, date in
                VStack(spacing: 2) {
                    Text(dayNames[idx])
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("\(Calendar.current.component(.day, from: date))")
                        .font(.caption)
                        .fontWeight(isToday(date) ? .bold : .regular)
                        .foregroundStyle(isToday(date) ? .white : .primary)
                        .frame(width: 24, height: 24)
                        .background(isToday(date) ? Color.accentColor : .clear)
                        .clipShape(Circle())
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Hour Gutter

    private var hourGutter: some View {
        ZStack(alignment: .topLeading) {
            ForEach(0..<hourCount, id: \.self) { hour in
                Text(formatHour(hour))
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .frame(width: gutterWidth, alignment: .trailing)
                    .padding(.trailing, 4)
                    .offset(y: CGFloat(hour) * hourHeight - 6)

                // Grid line
                Rectangle()
                    .fill(Color(.separator).opacity(0.3))
                    .frame(height: 0.5)
                    .padding(.leading, gutterWidth)
                    .offset(y: CGFloat(hour) * hourHeight)
            }
        }
    }

    // MARK: - Day Column

    private func dayColumn(for date: Date) -> some View {
        let key = dayKey(date)
        let dayEvents = eventsByDay[key] ?? []
        let positioned = positionEvents(dayEvents)

        return ZStack(alignment: .topLeading) {
            // Tap target for empty slots
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { location in
                    let hour = Int(location.y / hourHeight)
                    let clampedHour = max(0, min(hour, 23))
                    let calendar = Calendar.current
                    if let tappedDate = calendar.date(
                        bySettingHour: clampedHour, minute: 0, second: 0, of: date
                    ) {
                        viewModel.tapDay(tappedDate)
                    }
                }

            // Event blocks
            ForEach(positioned, id: \.event.id) { positioned in
                let color = Color(hex: positioned.event.assignees.first?.color ?? "#6b7280")
                GeometryReader { geo in
                    let colWidth = geo.size.width / CGFloat(positioned.totalCols)
                    WeekEventBlockView(
                        title: positioned.event.title,
                        timeLabel: formatTimeRange(positioned.event.start, positioned.event.end),
                        color: color,
                        top: positioned.top,
                        height: positioned.height,
                        left: CGFloat(positioned.col) * colWidth,
                        width: colWidth,
                        onTap: { viewModel.tapEvent(id: positioned.event.id) }
                    )
                    .frame(width: colWidth, height: positioned.height)
                    .offset(x: CGFloat(positioned.col) * colWidth, y: positioned.top)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .background(isToday(date) ? Color.accentColor.opacity(0.03) : .clear)
        .overlay(
            Rectangle()
                .fill(Color(.separator).opacity(0.2))
                .frame(width: 0.5),
            alignment: .leading
        )
    }
}

// MARK: - Event Positioning

private struct PositionedEvent {
    let event: CalendarEvent
    let top: CGFloat
    let height: CGFloat
    let col: Int
    let totalCols: Int
}

private func positionEvents(_ events: [CalendarEvent]) -> [PositionedEvent] {
    guard !events.isEmpty else { return [] }

    let calendar = Calendar.current
    let sorted = events.sorted { $0.start < $1.start }

    var partialResults: [PositionedEvent] = []
    var columns: [Int] = [] // end minutes for each column

    for event in sorted {
        let startMinutes = calendar.component(.hour, from: event.start) * 60
            + calendar.component(.minute, from: event.start)
        let endMinutes = calendar.component(.hour, from: event.end) * 60
            + calendar.component(.minute, from: event.end)

        let top = CGFloat(startMinutes) / 60.0 * hourHeight
        let height = max(CGFloat(endMinutes - startMinutes) / 60.0 * hourHeight, 12)

        var col = 0
        while col < columns.count && columns[col] > startMinutes {
            col += 1
        }

        if col < columns.count {
            columns[col] = endMinutes
        } else {
            columns.append(endMinutes)
        }

        partialResults.append(PositionedEvent(event: event, top: top, height: height, col: col, totalCols: 0))
    }

    let totalCols = columns.count
    return partialResults.map { item in
        PositionedEvent(event: item.event, top: item.top, height: item.height, col: item.col, totalCols: totalCols)
    }
}

private func dayKey(_ date: Date) -> String {
    let cal = Calendar.current
    return "\(cal.component(.year, from: date))-\(cal.component(.month, from: date))-\(cal.component(.day, from: date))"
}

private func formatTimeRange(_ start: Date, _ end: Date) -> String {
    let fmt: (Date) -> String = { date in
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        let suffix = hour >= 12 ? "p" : "a"
        let hour12 = hour % 12 == 0 ? 12 : hour % 12
        return minute > 0 ? "\(hour12):\(String(format: "%02d", minute))\(suffix)" : "\(hour12)\(suffix)"
    }
    return "\(fmt(start)) – \(fmt(end))"
}
