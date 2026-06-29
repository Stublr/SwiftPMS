import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

final alertsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final response = await api.get('/audit', queryParameters: {
    'limit': '20',
  });
  final data = response.data;
  if (data is Map && data.containsKey('items')) {
    return List<Map<String, dynamic>>.from(data['items']);
  }
  return List<Map<String, dynamic>>.from(data);
});

class AlertsScreen extends ConsumerWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alertsAsync = ref.watch(alertsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Activity & Alerts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(alertsProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(alertsProvider),
        child: alertsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Error: $err')),
          data: (items) {
            if (items.isEmpty) {
              return const Center(
                child: Text('No recent activity'),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                final action = item['action'] ?? '';
                final icon = _getIconForAction(action);

                return Card(
                  child: ListTile(
                    leading: Icon(icon, color: _getColorForAction(action)),
                    title: Text(action.toString().replaceAll('_', ' ')),
                    subtitle: Text(
                      '${item['entityType'] ?? ''} • ${item['userName'] ?? 'Unknown user'}',
                    ),
                    trailing: Text(
                      _formatDate(item['createdAt']),
                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  IconData _getIconForAction(String action) {
    if (action.contains('void')) return Icons.cancel;
    if (action.contains('refund')) return Icons.undo;
    if (action.contains('stock')) return Icons.inventory;
    if (action.contains('transfer')) return Icons.swap_horiz;
    if (action.contains('purchase')) return Icons.shopping_cart;
    return Icons.info;
  }

  Color _getColorForAction(String action) {
    if (action.contains('void')) return Colors.red;
    if (action.contains('refund')) return Colors.orange;
    if (action.contains('stock')) return Colors.blue;
    if (action.contains('transfer')) return Colors.purple;
    return Colors.grey;
  }

  String _formatDate(dynamic dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr.toString());
      final now = DateTime.now();
      final diff = now.difference(date);
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) {
      return '';
    }
  }
}
