import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:smartpos_mobile/main.dart';

void main() {
  testWidgets('App renders smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: SmartPOSApp()),
    );
    await tester.pumpAndSettle();

    // App should render (login screen by default)
    expect(find.text('SmartPOS'), findsOneWidget);
  });
}
