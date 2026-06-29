import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          // User info
          Container(
            padding: const EdgeInsets.all(24),
            color: Theme.of(context).colorScheme.primaryContainer.withAlpha(50),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 36,
                  child: Text(
                    (auth.fullName ?? 'U')[0].toUpperCase(),
                    style: const TextStyle(fontSize: 24),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  auth.fullName ?? 'Unknown',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  auth.role?.replaceAll('_', ' ').toUpperCase() ?? '',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          ListTile(
            leading: const Icon(Icons.store),
            title: const Text('Branches'),
            subtitle: Text('${auth.branchIds.length} branch(es)'),
            onTap: () {},
          ),
          const Divider(),

          ListTile(
            leading: const Icon(Icons.notifications_outlined),
            title: const Text('Notification Settings'),
            onTap: () {},
          ),
          const Divider(),

          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('About'),
            subtitle: const Text('SmartPOS Mobile v1.0.0'),
            onTap: () {},
          ),
          const Divider(),

          const SizedBox(height: 16),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: () => ref.read(authProvider.notifier).logout(),
              icon: const Icon(Icons.logout, color: Colors.red),
              label: const Text(
                'Sign Out',
                style: TextStyle(color: Colors.red),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
