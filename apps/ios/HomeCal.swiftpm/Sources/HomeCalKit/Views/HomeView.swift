import SwiftUI

public struct HomeView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var viewModel = CalendarViewModel()
    @State private var showMemberFilter = false
    @State private var isSigningOut = false
    @State private var smartInputText = ""

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Title + navigation bar
                HStack {
                    Button { viewModel.goBackward() } label: {
                        Image(systemName: "chevron.left")
                    }
                    Button { viewModel.goForward() } label: {
                        Image(systemName: "chevron.right")
                    }

                    Text(viewModel.title)
                        .font(.headline)

                    Spacer()

                    Picker("View", selection: $viewModel.viewMode) {
                        ForEach(CalendarViewMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 190)
                }
                .padding(.horizontal)
                .padding(.vertical, 6)

                Divider()

                // Smart input bar
                HStack(spacing: 8) {
                    TextField(
                        "e.g. Dentist next Tuesday 2pm",
                        text: $smartInputText
                    )
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.go)
                    .onSubmit { submitSmartInput() }
                    .disabled(viewModel.isParsingSmartInput)

                    Button {
                        submitSmartInput()
                    } label: {
                        if viewModel.isParsingSmartInput {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Image(systemName: "sparkles")
                        }
                    }
                    .disabled(
                        smartInputText.trimmingCharacters(in: .whitespaces).isEmpty
                            || viewModel.isParsingSmartInput
                    )
                }
                .padding(.horizontal)
                .padding(.vertical, 6)

                if let error = viewModel.smartInputError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                if viewModel.isLoading && viewModel.events.isEmpty {
                    Spacer()
                    ProgressView("Loading…")
                    Spacer()
                } else {
                    switch viewModel.viewMode {
                    case .month:
                        MonthGridView(viewModel: viewModel)
                    case .week:
                        WeekGridView(viewModel: viewModel)
                    case .day:
                        DayGridView(viewModel: viewModel)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        Button {
                            showMemberFilter = true
                        } label: {
                            Image(systemName: "line.3.horizontal.decrease.circle")
                        }

                        Button {
                            Task { await signOut() }
                        } label: {
                            if isSigningOut {
                                ProgressView()
                            } else {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                            }
                        }
                        .disabled(isSigningOut)
                    }
                }
            }
            .sheet(isPresented: $showMemberFilter) {
                MemberFilterView(viewModel: viewModel)
                    .presentationDetents([.medium])
            }
            .sheet(
                isPresented: Binding(
                    get: { viewModel.selectedNewEventDate != nil },
                    set: { if !$0 { viewModel.clearSelection() } }
                ),
                onDismiss: { Task { await viewModel.loadData() } },
                content: {
                    EventFormView(
                        apiClient: authManager.apiClient,
                        onSave: {},
                        eventId: nil,
                        initialDate: viewModel.selectedNewEventDate,
                        parsedEvent: viewModel.parsedEvent,
                        members: viewModel.members,
                        currentUserId: authManager.currentUser?.id
                    )
                }
            )
            .sheet(
                isPresented: Binding(
                    get: { viewModel.selectedEventId != nil },
                    set: { if !$0 { viewModel.clearSelection() } }
                ),
                onDismiss: { Task { await viewModel.loadData() } },
                content: {
                    EventFormView(
                        apiClient: authManager.apiClient,
                        onSave: {},
                        eventId: viewModel.selectedEventId,
                        initialDate: nil,
                        parsedEvent: nil,
                        members: viewModel.members,
                        currentUserId: authManager.currentUser?.id
                    )
                }
            )
            .task {
                viewModel.configure(apiClient: authManager.apiClient)
                await viewModel.loadData()
            }
            .onChange(of: viewModel.currentDate) {
                Task { await viewModel.loadData() }
            }
            .onChange(of: viewModel.viewMode) {
                Task { await viewModel.loadData() }
            }
        }
    }

    private func submitSmartInput() {
        let trimmed = smartInputText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        Task {
            await viewModel.parseSmartInput(trimmed)
            smartInputText = ""
        }
    }

    private func signOut() async {
        isSigningOut = true
        defer { isSigningOut = false }
        try? await authManager.signOut()
    }
}
