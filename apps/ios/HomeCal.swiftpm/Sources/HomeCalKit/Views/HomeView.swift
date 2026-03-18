import SwiftUI

public struct HomeView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var viewModel = CalendarViewModel()
    @State private var showMemberFilter = false
    @State private var isSigningOut = false

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
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
                    }
                }
            }
            .navigationTitle(viewModel.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 4) {
                        Button { viewModel.goBackward() } label: {
                            Image(systemName: "chevron.left")
                        }
                        Button { viewModel.goForward() } label: {
                            Image(systemName: "chevron.right")
                        }
                    }
                }

                ToolbarItem(placement: .principal) {
                    Picker("View", selection: $viewModel.viewMode) {
                        ForEach(CalendarViewMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 140)
                }

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

    private func signOut() async {
        isSigningOut = true
        defer { isSigningOut = false }
        try? await authManager.signOut()
    }
}
