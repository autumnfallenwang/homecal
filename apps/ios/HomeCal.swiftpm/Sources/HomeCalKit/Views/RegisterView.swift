import SwiftUI

public struct RegisterView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var selectedColor = Color.blue
    @State private var isLoading = false
    @State private var errorMessage: String?

    public init() {}

    public var body: some View {
        Form {
            Section {
                TextField("Name", text: $name)
                    .textContentType(.name)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
            }

            Section {
                ColorPicker("Your Color", selection: $selectedColor, supportsOpacity: false)
            }

            Section {
                Button {
                    Task { await register() }
                } label: {
                    if isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Create Account")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(name.isEmpty || email.isEmpty || password.isEmpty || isLoading)
            }

            Section {
                Button("Already have an account? Sign In") {
                    dismiss()
                }
                .font(.footnote)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Register")
        .alert("Registration Failed", isPresented: .init(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func register() async {
        isLoading = true
        defer { isLoading = false }

        let hex = selectedColor.toHex()

        do {
            try await authManager.signUp(name: name, email: email, password: password, color: hex)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

extension Color {
    func toHex() -> String {
        guard let components = cgColor?.components, components.count >= 3 else {
            return "#3b82f6"
        }
        let red = Int(components[0] * 255)
        let green = Int(components[1] * 255)
        let blue = Int(components[2] * 255)
        return String(format: "#%02x%02x%02x", red, green, blue)
    }
}
