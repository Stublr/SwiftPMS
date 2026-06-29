import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final String? userId;
  final String? fullName;
  final String? role;
  final List<String> branchIds;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.userId,
    this.fullName,
    this.role,
    this.branchIds = const [],
  });

  AuthState copyWith({
    AuthStatus? status,
    String? userId,
    String? fullName,
    String? role,
    List<String>? branchIds,
  }) {
    return AuthState(
      status: status ?? this.status,
      userId: userId ?? this.userId,
      fullName: fullName ?? this.fullName,
      role: role ?? this.role,
      branchIds: branchIds ?? this.branchIds,
    );
  }
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    _checkAuth();
    return const AuthState();
  }

  Future<void> _checkAuth() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('access_token');
    if (token != null) {
      state = state.copyWith(
        status: AuthStatus.authenticated,
        userId: prefs.getString('user_id'),
        fullName: prefs.getString('full_name'),
        role: prefs.getString('role'),
      );
    } else {
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  Future<bool> login(String email, String password) async {
    final api = ref.read(apiClientProvider);
    try {
      final response = await api.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      final data = response.data;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('access_token', data['accessToken']);
      await prefs.setString('refresh_token', data['refreshToken']);
      await prefs.setString('user_id', data['user']['id']);
      await prefs.setString('full_name', data['user']['fullName']);
      await prefs.setString('role', data['user']['role']);

      state = AuthState(
        status: AuthStatus.authenticated,
        userId: data['user']['id'],
        fullName: data['user']['fullName'],
        role: data['user']['role'],
        branchIds: List<String>.from(data['user']['branchIds'] ?? []),
      );

      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
    await prefs.remove('user_id');
    await prefs.remove('full_name');
    await prefs.remove('role');
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
