import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

final inventoryProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  // Get low stock items as a quick inventory overview
  final response = await api.get('/inventory/low-stock');
  return List<Map<String, dynamic>>.from(response.data);
});

class InventoryScreen extends ConsumerWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventoryAsync = ref.watch(inventoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(inventoryProvider),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(inventoryProvider),
        child: inventoryAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 8),
                Text('Error: $err'),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => ref.invalidate(inventoryProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (items) {
            if (items.isEmpty) {
              return const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check_circle, size: 64, color: Colors.green),
                    SizedBox(height: 16),
                    Text('All stock levels are good!'),
                  ],
                ),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                final qty = item['quantity'] ?? 0;
                final reorder = item['reorderPoint'] ?? 0;
                final isLow = qty < reorder;

                return Card(
                  child: ListTile(
                    leading: Icon(
                      isLow ? Icons.warning : Icons.inventory_2,
                      color: isLow ? Colors.orange : Colors.grey,
                    ),
                    title: Text(item['productName'] ?? 'Unknown'),
                    subtitle: Text('SKU: ${item['productSku'] ?? 'N/A'}'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '$qty',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: isLow ? Colors.orange : Colors.black,
                          ),
                        ),
                        Text(
                          'Reorder: $reorder',
                          style: const TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
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
}
