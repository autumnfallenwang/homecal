import SwiftUI

struct WeekEventBlockView: View {
    let title: String
    let timeLabel: String
    let color: Color
    let top: CGFloat
    let height: CGFloat
    let left: CGFloat
    let width: CGFloat
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.caption2)
                    .fontWeight(.medium)
                    .lineLimit(1)
                    .foregroundStyle(color)

                if height >= 48 {
                    Text(timeLabel)
                        .font(.system(size: 9))
                        .foregroundStyle(color.opacity(0.8))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 3)
            .padding(.vertical, 2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
    }
}
