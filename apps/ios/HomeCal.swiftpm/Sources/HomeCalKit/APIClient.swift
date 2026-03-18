import Foundation

public actor APIClient {
    public let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public var bearerToken: String?

    public init(baseURL: URL = Configuration.apiBaseURL) {
        self.baseURL = baseURL
        self.session = URLSession.shared
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = formatter.date(from: string) {
                return date
            }
            // Fallback without fractional seconds
            let fallback = ISO8601DateFormatter()
            fallback.formatOptions = [.withInternetDateTime]
            if let date = fallback.date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(string)"
            )
        }
    }

    // MARK: - Generic Request

    private func request<T: Decodable>(
        method: String,
        path: String,
        body: (any Encodable)? = nil,
        extractToken: Bool = false
    ) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = bearerToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            urlRequest.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if extractToken {
            extractSessionToken(from: httpResponse)
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorBody = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = errorBody?["error"] as? String ?? "Request failed"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }

        return try decoder.decode(T.self, from: data)
    }

    private func requestNoContent(
        method: String,
        path: String
    ) async throws {
        let url = baseURL.appendingPathComponent(path)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = bearerToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorBody = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let message = errorBody?["error"] as? String ?? "Request failed"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    private func extractSessionToken(from response: HTTPURLResponse) {
        guard let setCookie = response.value(forHTTPHeaderField: "Set-Cookie") else { return }
        let cookies = setCookie.components(separatedBy: ",")
        for cookie in cookies {
            let trimmed = cookie.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("better-auth.session_token=") {
                let value = trimmed
                    .dropFirst("better-auth.session_token=".count)
                    .components(separatedBy: ";")
                    .first ?? ""
                if !value.isEmpty {
                    bearerToken = String(value)
                }
                return
            }
        }
    }

    public func setBearerToken(_ token: String?) {
        bearerToken = token
    }

    // MARK: - Health

    public func healthCheck() async throws -> String {
        struct HealthResponse: Decodable {
            let status: String
        }
        let response: HealthResponse = try await request(method: "GET", path: "/health")
        return response.status
    }

    // MARK: - Auth

    public func signUp(_ input: SignUpRequest) async throws -> AuthResponse {
        try await request(
            method: "POST",
            path: "/api/auth/sign-up/email",
            body: input,
            extractToken: true
        )
    }

    public func signIn(_ input: SignInRequest) async throws -> AuthResponse {
        try await request(
            method: "POST",
            path: "/api/auth/sign-in/email",
            body: input,
            extractToken: true
        )
    }

    public func signOut() async throws {
        try await requestNoContent(method: "POST", path: "/api/auth/sign-out")
        bearerToken = nil
    }

    public func getSession() async throws -> SessionResponse {
        try await request(method: "GET", path: "/api/auth/get-session")
    }

    // MARK: - Events

    public func fetchEvents(from: String? = nil, to: String? = nil) async throws -> [CalendarEvent] {
        var path = "/api/events"
        var queryItems: [String] = []
        if let from { queryItems.append("from=\(from)") }
        if let to { queryItems.append("to=\(to)") }
        if !queryItems.isEmpty {
            path += "?" + queryItems.joined(separator: "&")
        }
        return try await request(method: "GET", path: path)
    }

    public func getEvent(id: String) async throws -> CalendarEventWithOwner {
        try await request(method: "GET", path: "/api/events/\(id)")
    }

    public func createEvent(_ input: CreateEventInput) async throws -> CalendarEvent {
        try await request(method: "POST", path: "/api/events", body: input)
    }

    public func updateEvent(id: String, _ input: UpdateEventInput) async throws -> CalendarEvent {
        try await request(method: "PATCH", path: "/api/events/\(id)", body: input)
    }

    public func deleteEvent(id: String) async throws {
        try await requestNoContent(method: "DELETE", path: "/api/events/\(id)")
    }

    public func getEventLogs(eventId: String) async throws -> [EventLogEntry] {
        try await request(method: "GET", path: "/api/events/\(eventId)/logs")
    }

    // MARK: - Members

    public func fetchMembers() async throws -> [Member] {
        try await request(method: "GET", path: "/api/users")
    }

    // MARK: - Parse

    public func parseEvent(_ input: ParseEventInput) async throws -> ParsedEvent {
        try await request(method: "POST", path: "/api/events/parse", body: input)
    }
}

// MARK: - Errors

public enum APIError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .httpError(let statusCode, let message):
            return "HTTP \(statusCode): \(message)"
        }
    }
}
