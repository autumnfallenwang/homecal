import SwiftUI

private let hourHeight: CGFloat = 48
private let hourCount = 24
private let scrollToHour = 7
private let gutterWidth: CGFloat = 44

struct DayGridView: View {
    @Bindable var viewModel: CalendarViewModel

    private var dayEvents: [CalendarEvent] {
        let calendar = Calendar.current
        return viewModel.filteredEvents.filter {
            calendar.isDate($0.start, inSameDayAs: viewModel.currentDate)
        }
    }

    private var memberColorMap: [String: String] {
        Dictionary(uniqueKeysWithValues: viewModel.members.map { ($0.id, $0.color) })
    }

    var body: some View {
        ScrollView(.vertical) {
            ZStack(alignment: .topLeading) {
                hourGutter

                HStack(spacing: 0) {
                    Color.clear.frame(width: gutterWidth)
                    dayColumn
                }
            }
            .frame(height: CGFloat(hourCount) * hourHeight)
        }
        .defaultScrollAnchor(
            UnitPoint(x: 0, y: CGFloat(scrollToHour) / CGFloat(hourCount))
        )
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

                Rectangle()
                    .fill(Color(.separator).opacity(0.3))
                    .frame(height: 0.5)
                    .padding(.leading, gutterWidth)
                    .offset(y: CGFloat(hour) * hourHeight)
            }
        }
    }

    // MARK: - Day Column

    private var dayColumn: some View {
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
                        bySettingHour: clampedHour, minute: 0, second: 0, of: viewModel.currentDate
                    ) {
                        viewModel.tapDay(tappedDate)
                    }
                }

            // Event blocks
            ForEach(positioned, id: \.event.id) { item in
                let color = Color(hex: item.event.assignees.first?.color ?? "#6b7280")
                GeometryReader { geo in
                    let colWidth = geo.size.width / CGFloat(item.totalCols)
                    WeekEventBlockView(
                        title: item.event.title,
                        timeLabel: formatTimeRange(item.event.start, item.event.end),
                        color: color,
                        top: item.top,
                        height: item.height,
                        left: CGFloat(item.col) * colWidth,
                        width: colWidth,
                        onTap: { viewModel.tapEvent(id: item.event.id) }
                    )
                    .frame(width: colWidth, height: item.height)
                    .offset(x: CGFloat(item.col) * colWidth, y: item.top)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .background(isToday(viewModel.currentDate) ? Color.accentColor.opacity(0.03) : .clear)
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
    var columns: [Int] = []

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
