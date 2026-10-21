import 'package:flutter_test/flutter_test.dart';
import 'package:dart_net_inspector/main.dart';

void main() {
  testWidgets('NetworkInspectorDemoApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const NetworkInspectorDemoApp());

    expect(find.text('Flutter Network Inspector Demo'), findsOneWidget);
    expect(find.text('Standard GET'), findsOneWidget);
    expect(find.text('Dio GET (Auth/Params)'), findsOneWidget);
    expect(find.text('Burst (30 Reqs)'), findsOneWidget);
  });
}
