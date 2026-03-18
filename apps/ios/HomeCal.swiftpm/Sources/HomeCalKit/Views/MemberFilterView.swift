import SwiftUI

struct MemberFilterView: View {
    @Bindable var viewModel: CalendarViewModel

    var body: some View {
        NavigationStack {
            List(viewModel.members) { member in
                Button {
                    viewModel.toggleMember(id: member.id)
                } label: {
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color(hex: member.color))
                            .frame(width: 24, height: 24)

                        Text(member.name)
                            .foregroundStyle(.primary)

                        Spacer()

                        if viewModel.visibleMemberIds.contains(member.id) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                                .fontWeight(.semibold)
                        }
                    }
                }
            }
            .navigationTitle("Filter Members")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
