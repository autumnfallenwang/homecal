import SwiftUI

struct EventFormView: View {
    @Environment(\.dismiss) private var dismiss
    let apiClient: APIClient
    let onSave: () -> Void

    // Mode: edit if eventId is set, create if initialDate is set
    let eventId: String?
    let initialDate: Date?
    let parsedEvent: ParsedEvent?
    let members: [Member]
    let currentUserId: String?

    @State private var title = ""
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var isPrivate = false
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var showDeleteConfirmation = false
    @State private var isLoadingEvent = false
    @State private var logs: [EventLogEntry] = []
    @State private var showLogs = false
    @State private var selectedAssigneeIds: Set<String> = []

    private var isEditMode: Bool { eventId != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Event title", text: $title)
                    DatePicker("Start", selection: $startDate)
                    DatePicker("End", selection: $endDate)
                    Toggle("Private", isOn: $isPrivate)
                }

                if !members.isEmpty {
                    assigneesSection
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                }

                if isEditMode {
                    Section {
                        if logs.isEmpty {
                            Text("No changes recorded")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        } else {
                            DisclosureGroup("Change Log (\(logs.count))", isExpanded: $showLogs) {
                                ForEach(logs) { log in
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack {
                                            Circle()
                                                .fill(Color(hex: log.user.color))
                                                .frame(width: 6, height: 6)
                                            Text(log.user.name)
                                                .font(.caption)
                                                .fontWeight(.semibold)
                                            Text(log.action)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                            Spacer()
                                            Text(formatTimeAgo(log.timestamp))
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        if log.action == "updated", let changes = log.changes {
                                            ForEach(
                                                changes.sorted(by: { $0.key < $1.key }),
                                                id: \.key
                                            ) { field, change in
                                                Text(formatFieldChange(field, change))
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                    } header: {
                        Text("Activity")
                    }
                }

                if isEditMode {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            HStack {
                                Spacer()
                                if isDeleting {
                                    ProgressView()
                                } else {
                                    Text("Delete Event")
                                }
                                Spacer()
                            }
                        }
                        .disabled(isDeleting || isSaving)
                    }
                }
            }
            .navigationTitle(isEditMode ? "Edit Event" : "New Event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .alert("Delete Event", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task { await deleteEvent() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to delete this event? This cannot be undone.")
            }
            .overlay {
                if isLoadingEvent {
                    ProgressView("Loading…")
                }
            }
            .disabled(isLoadingEvent)
            .task {
                if let eventId {
                    await loadEvent(id: eventId)
                } else if let parsedEvent {
                    title = parsedEvent.title
                    if let start = parsedEvent.localStartDate() {
                        startDate = start
                    }
                    if let end = parsedEvent.localEndDate() {
                        endDate = end
                    }
                    if let ids = parsedEvent.assigneeIds, !ids.isEmpty {
                        selectedAssigneeIds = Set(ids)
                    } else if let userId = currentUserId {
                        selectedAssigneeIds = [userId]
                    }
                } else if let initialDate {
                    startDate = initialDate
                    let calendar = Calendar.current
                    endDate = calendar.date(byAdding: .hour, value: 1, to: initialDate) ?? initialDate
                    if let userId = currentUserId {
                        selectedAssigneeIds = [userId]
                    }
                }
            }
        }
    }

    // MARK: - Subviews

    private var assigneesSection: some View {
        Section("Assignees") {
            ForEach(members, id: \.id) { (member: Member) in
                assigneeRow(member)
            }
        }
    }

    private func assigneeRow(_ member: Member) -> some View {
        Button {
            if selectedAssigneeIds.contains(member.id) {
                selectedAssigneeIds.remove(member.id)
            } else {
                selectedAssigneeIds.insert(member.id)
            }
        } label: {
            HStack {
                Circle()
                    .fill(Color(hex: member.color))
                    .frame(width: 10, height: 10)
                Text(member.name)
                    .foregroundStyle(.primary)
                Spacer()
                if selectedAssigneeIds.contains(member.id) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func loadEvent(id: String) async {
        isLoadingEvent = true
        defer { isLoadingEvent = false }

        do {
            let event = try await apiClient.getEvent(id: id)
            title = event.title
            startDate = event.start
            endDate = event.end
            isPrivate = event.isPrivate
            selectedAssigneeIds = Set(event.assignees.map(\.id))
        } catch {
            errorMessage = error.localizedDescription
            return
        }

        do {
            logs = try await apiClient.getEventLogs(eventId: id)
        } catch {
            print("getEventLogs error: \(error)")
        }
    }

    private func save() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
        guard !trimmedTitle.isEmpty else { return }

        isSaving = true
        defer { isSaving = false }
        errorMessage = nil

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let startStr = formatter.string(from: startDate)
        let endStr = formatter.string(from: endDate)

        do {
            if let eventId {
                let input = UpdateEventInput(
                    title: trimmedTitle,
                    start: startStr,
                    end: endStr,
                    isPrivate: isPrivate,
                    assigneeIds: Array(selectedAssigneeIds)
                )
                _ = try await apiClient.updateEvent(id: eventId, input)
            } else {
                let input = CreateEventInput(
                    title: trimmedTitle,
                    start: startStr,
                    end: endStr,
                    isPrivate: isPrivate,
                    assigneeIds: Array(selectedAssigneeIds)
                )
                _ = try await apiClient.createEvent(input)
            }
            onSave()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteEvent() async {
        guard let eventId else { return }

        isDeleting = true
        defer { isDeleting = false }
        errorMessage = nil

        do {
            try await apiClient.deleteEvent(id: eventId)
            onSave()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private func formatFieldChange(_ field: String, _ change: FieldChange) -> String {
    let from = displayValue(field, change.from)
    let to = displayValue(field, change.to)

    switch field {
    case "title":
        return "title: \"\(from)\" → \"\(to)\""
    case "start", "end":
        return "\(field): \(from) → \(to)"
    case "private":
        let fromLabel = from == "true" ? "private" : "shared"
        let toLabel = to == "true" ? "private" : "shared"
        return "visibility: \(fromLabel) → \(toLabel)"
    default:
        return "\(field): \(from) → \(to)"
    }
}

private func displayValue(_ field: String, _ value: JSONValue) -> String {
    switch value {
    case .string(let str):
        if field == "start" || field == "end" {
            return formatDateString(str)
        }
        return str
    case .bool(let val):
        return val ? "true" : "false"
    case .int(let val):
        return "\(val)"
    case .double(let val):
        return "\(val)"
    case .null:
        return "—"
    }
}

private func formatDateString(_ iso: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: iso) {
        return date.formatted(date: .abbreviated, time: .shortened)
    }
    formatter.formatOptions = [.withInternetDateTime]
    if let date = formatter.date(from: iso) {
        return date.formatted(date: .abbreviated, time: .shortened)
    }
    return iso
}

private func formatTimeAgo(_ date: Date) -> String {
    let seconds = Int(Date().timeIntervalSince(date))
    let minutes = seconds / 60
    let hours = seconds / 3600
    let days = seconds / 86400

    if minutes < 1 { return "just now" }
    if minutes < 60 { return "\(minutes)m ago" }
    if hours < 24 { return "\(hours)h ago" }
    if days < 30 { return "\(days)d ago" }
    return date.formatted(date: .abbreviated, time: .omitted)
}
