import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String kBaseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:3000/v1', // Android emulator localhost
);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

class ApiClient {
  late final Dio _dio;

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: kBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Try to refresh token
          final refreshed = await _tryRefresh();
          if (refreshed) {
            // Retry original request
            final opts = error.requestOptions;
            final prefs = await SharedPreferences.getInstance();
            opts.headers['Authorization'] =
                'Bearer ${prefs.getString('access_token')}';
            final response = await _dio.fetch(opts);
            return handler.resolve(response);
          }
        }
        handler.next(error);
      },
    ));
  }

  Future<bool> _tryRefresh() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final refreshToken = prefs.getString('refresh_token');
      if (refreshToken == null) return false;

      final response = await Dio(BaseOptions(baseUrl: kBaseUrl)).post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      final data = response.data;
      await prefs.setString('access_token', data['accessToken']);
      await prefs.setString('refresh_token', data['refreshToken']);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Response> get(String path,
      {Map<String, dynamic>? queryParameters}) async {
    return _dio.get(path, queryParameters: queryParameters);
  }

  Future<Response> post(String path, {dynamic data}) async {
    return _dio.post(path, data: data);
  }

  Future<Response> patch(String path, {dynamic data}) async {
    return _dio.patch(path, data: data);
  }

  Future<Response> delete(String path) async {
    return _dio.delete(path);
  }
}
