import SwiftUI

struct AccountView: View {
    @Environment(AppContainer.self) private var container
    @State private var mode: AuthMode = .login

    var body: some View {
        Group {
            switch container.auth.state {
            case .unknown:
                LabnaLoadingView(title: "auth.restoring")
            case .guest:
                AuthFormView(mode: $mode)
            case .authenticated(let customer):
                AuthenticatedAccountView(customer: customer)
            }
        }
        .navigationTitle("account.title")
        .background(Color.labnaCream.opacity(0.35))
        .task {
            if container.auth.isAuthenticated {
                await container.auth.refreshCustomer()
            }
        }
    }
}

private enum AuthMode {
    case login
    case register
}

private struct AuthFormView: View {
    @Environment(AppContainer.self) private var container
    @Binding var mode: AuthMode
    @State private var name = ""
    @State private var phoneNumber = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LabnaSpacing.large) {
                VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                    LabnaLogo()
                    Text(mode == .login ? "auth.login.subtitle" : "auth.register.subtitle")
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Picker("auth.mode", selection: $mode) {
                    Text("auth.login.title").tag(AuthMode.login)
                    Text("auth.register.title").tag(AuthMode.register)
                }
                .pickerStyle(.segmented)

                VStack(spacing: LabnaSpacing.medium) {
                    if mode == .register {
                        AuthTextField(title: "auth.name", text: $name, identifier: "auth.name", contentType: .name, keyboard: .default)
                        AuthTextField(title: "auth.phone", text: $phoneNumber, identifier: "auth.phone", contentType: .telephoneNumber, keyboard: .phonePad)
                    }
                    AuthTextField(title: "auth.email", text: $email, identifier: "auth.email", contentType: .emailAddress, keyboard: .emailAddress)
                    SecureField("auth.password", text: $password)
                        .textContentType(mode == .login ? .password : .newPassword)
                        .padding(LabnaSpacing.medium)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
                        .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
                        .accessibilityIdentifier("auth.password")
                }

                if let error = container.auth.lastError {
                    Label(LocalizedStringKey(error.messageKey), systemImage: "exclamationmark.circle")
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.red)
                        .accessibilityIdentifier("auth.error")
                }

                Button(action: submit) {
                    if container.auth.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text(mode == .login ? "auth.login.action" : "auth.register.action")
                    }
                }
                .buttonStyle(.labnaPrimary)
                .disabled(container.auth.isLoading || !isValid)
                .accessibilityIdentifier(mode == .login ? "auth.login.submit" : "auth.register.submit")
            }
            .padding(LabnaSpacing.large)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var isValid: Bool {
        let hasLoginFields = email.contains("@") && !password.isEmpty
        if mode == .login { return hasLoginFields }
        return hasLoginFields && name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && phoneNumber.hasPrefix("+") && password.count >= 8
    }

    private func submit() {
        Task {
            switch mode {
            case .login:
                await container.auth.login(email: email, password: password)
            case .register:
                await container.auth.register(name: name, phoneNumber: phoneNumber, email: email, password: password)
            }
        }
    }
}

private struct AuthTextField: View {
    let title: LocalizedStringKey
    @Binding var text: String
    let identifier: String
    let contentType: UITextContentType
    let keyboard: UIKeyboardType

    var body: some View {
        TextField(title, text: $text)
            .textContentType(contentType)
            .keyboardType(keyboard)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(LabnaSpacing.medium)
            .background(Color.white, in: RoundedRectangle(cornerRadius: LabnaRadius.medium))
            .overlay { RoundedRectangle(cornerRadius: LabnaRadius.medium).stroke(Color.labnaBorder) }
            .accessibilityIdentifier(identifier)
    }
}

private struct AuthenticatedAccountView: View {
    @Environment(AppContainer.self) private var container
    let customer: Customer

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: LabnaSpacing.small) {
                    Text(customer.name)
                        .font(LabnaTypography.title)
                        .foregroundStyle(Color.labnaInk)
                    Text(customer.email)
                        .font(LabnaTypography.body)
                        .foregroundStyle(Color.labnaMuted)
                    Text(customer.phoneNumber)
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.labnaMuted)
                }
                .padding(.vertical, LabnaSpacing.small)
                .accessibilityIdentifier("account.customer")
            }

            Section("account.manage") {
                NavigationLink {
                    EditProfileView(customer: customer)
                } label: {
                    Label("account.editProfile", systemImage: "person.text.rectangle")
                }
                .accessibilityIdentifier("account.editProfile")

                NavigationLink {
                    ChangePasswordView()
                } label: {
                    Label("account.changePassword", systemImage: "lock.rotation")
                }
                .accessibilityIdentifier("account.changePassword")
            }

            Section("account.availableLater") {
                Label("account.addressesSoon", systemImage: "mappin.and.ellipse")
                Label("account.ordersSoon", systemImage: "shippingbox")
            }
            .foregroundStyle(Color.labnaMuted)

            Section {
                Button(role: .destructive) {
                    Task { await container.auth.logout() }
                } label: {
                    if container.auth.isLoading {
                        ProgressView()
                    } else {
                        Text("auth.logout")
                    }
                }
                .accessibilityIdentifier("auth.logout")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.labnaCream.opacity(0.45))
        .refreshable { await container.auth.refreshCustomer() }
    }
}

private struct EditProfileView: View {
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var phoneNumber: String
    @State private var email: String

    init(customer: Customer) {
        _name = State(initialValue: customer.name)
        _phoneNumber = State(initialValue: customer.phoneNumber)
        _email = State(initialValue: customer.email)
    }

    var body: some View {
        Form {
            Section("account.profile") {
                AuthTextField(title: "auth.name", text: $name, identifier: "account.name", contentType: .name, keyboard: .default)
                AuthTextField(title: "auth.phone", text: $phoneNumber, identifier: "account.phone", contentType: .telephoneNumber, keyboard: .phonePad)
                AuthTextField(title: "auth.email", text: $email, identifier: "account.email", contentType: .emailAddress, keyboard: .emailAddress)
            }

            if let error = container.auth.lastError {
                Section {
                    AuthErrorLabel(error: error)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle("account.editProfile")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("account.save") { save() }
                    .disabled(container.auth.isLoading || !isValid)
                    .accessibilityIdentifier("account.saveProfile")
            }
        }
    }

    private var isValid: Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && phoneNumber.hasPrefix("+") && email.contains("@")
    }

    private func save() {
        Task {
            if await container.auth.updateProfile(name: name, phoneNumber: phoneNumber, email: email) {
                dismiss()
            }
        }
    }
}

private struct ChangePasswordView: View {
    @Environment(AppContainer.self) private var container
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var localErrorKey: LocalizedStringKey?

    var body: some View {
        Form {
            Section("account.changePassword") {
                SecureField("account.currentPassword", text: $currentPassword)
                    .textContentType(.password)
                    .accessibilityIdentifier("account.currentPassword")
                SecureField("account.newPassword", text: $newPassword)
                    .textContentType(.newPassword)
                    .accessibilityIdentifier("account.newPassword")
                SecureField("account.confirmPassword", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .accessibilityIdentifier("account.confirmPassword")
            }

            if let localErrorKey {
                Section {
                    Label(localErrorKey, systemImage: "exclamationmark.circle")
                        .font(LabnaTypography.caption)
                        .foregroundStyle(Color.red)
                        .accessibilityIdentifier("account.password.localError")
                }
            } else if let error = container.auth.lastError {
                Section {
                    AuthErrorLabel(error: error)
                }
            }

            Section {
                Button {
                    submit()
                } label: {
                    if container.auth.isLoading {
                        ProgressView()
                    } else {
                        Text("account.changePassword")
                    }
                }
                .disabled(container.auth.isLoading || currentPassword.isEmpty || newPassword.isEmpty || confirmPassword.isEmpty)
                .accessibilityIdentifier("account.submitPassword")
            } footer: {
                Text("account.passwordInvalidatesSession")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.labnaCream.opacity(0.45))
        .navigationTitle("account.changePassword")
    }

    private func submit() {
        localErrorKey = nil
        guard newPassword.count >= 8 else {
            localErrorKey = "account.passwordTooShort"
            return
        }
        guard newPassword == confirmPassword else {
            localErrorKey = "account.passwordMismatch"
            return
        }
        Task {
            _ = await container.auth.changePassword(currentPassword: currentPassword, newPassword: newPassword)
        }
    }
}

private struct AuthErrorLabel: View {
    let error: AuthError

    var body: some View {
        Label(LocalizedStringKey(error.messageKey), systemImage: "exclamationmark.circle")
            .font(LabnaTypography.caption)
            .foregroundStyle(Color.red)
            .accessibilityIdentifier("auth.error")
    }
}

#Preview("Guest") {
    NavigationStack { AccountView() }
        .environment(AppContainer.preview(language: .english))
}
