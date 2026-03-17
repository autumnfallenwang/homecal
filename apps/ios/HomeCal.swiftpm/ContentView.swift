import SwiftUI

struct ContentView: View {
    @State private var healthStatus: String = "Not checked"
    @State private var isChecking = false

    var body: some View {
        VStack(spacing: 24) {
            Text("HomeCal")
                .font(.largeTitle.bold())

            VStack(spacing: 8) {
                Text("API Status")
                    .font(.headline)
                Text(healthStatus)
                    .foregroundStyle(healthStatus == "ok" ? .green : .secondary)
            }

            Button {
                Task {
                    await checkHealth()
                }
            } label: {
                if isChecking {
                    ProgressView()
                } else {
                    Label("Check Health", systemImage: "heart.fill")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isChecking)
        }
        .padding()
    }

    private func checkHealth() async {
        isChecking = true
        defer { isChecking = false }

        let client = APIClient()
        do {
            let status = try await client.healthCheck()
            healthStatus = status
        } catch {
            healthStatus = "Error: \(error.localizedDescription)"
        }
    }
}
