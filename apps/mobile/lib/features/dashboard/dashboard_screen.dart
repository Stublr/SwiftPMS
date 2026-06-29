import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';

final dashboardDataProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final response = await api.get('/reports/dashboard');
  return Map<String, dynamic>.from(response.data);
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final dashboardAsync = ref.watch(dashboardDataProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(dashboardDataProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(dashboardDataProvider),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Greeting
            Text(
              'Welcome, ${auth.fullName ?? 'Owner'}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),

            // Dashboard data
            dashboardAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'Failed to load dashboard: $err',
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              ),
              data: (data) => Column(
                children: [
                  _buildMetricRow(context, [
                    _MetricCard(
                      title: "Today's Sales",
                      value: '\$${data['todaySales'] ?? '0.00'}',
                      icon: Icons.attach_money,
                      color: Colors.green,
                    ),
                    _MetricCard(
                      title: 'Transactions',
                      value: '${data['todayTransactions'] ?? 0}',
                      icon: Icons.receipt_long,
                      color: Colors.blue,
                    ),
                  ]),
                  const SizedBox(height: 12),
                  _buildMetricRow(context, [
                    _MetricCard(
                      title: 'Low Stock Items',
                      value: '${data['lowStockCount'] ?? 0}',
                      icon: Icons.warning,
                      color: Colors.orange,
                    ),
                    _MetricCard(
                      title: 'Active Registers',
                      value: '${data['activeRegisters'] ?? 0}',
                      icon: Icons.point_of_sale,
                      color: Colors.purple,
                    ),
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricRow(BuildContext context, List<_MetricCard> cards) {
    return Row(
      children: cards
          .map((card) => Expanded(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(card.icon, color: card.color, size: 28),
                        const SizedBox(height: 8),
                        Text(
                          card.value,
                          style: Theme.of(context)
                              .textTheme
                              .headlineMedium
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          card.title,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
              ))
          .toList(),
    );
  }
}

class _MetricCard {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  _MetricCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });
}
