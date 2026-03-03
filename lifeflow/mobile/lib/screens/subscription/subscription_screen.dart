import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({Key? key}) : super(key: key);

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  bool _isLoading = false;
  Map<String, dynamic>? _subscriptionData;
  String _billingCycle = 'monthly';

  @override
  void initState() {
    super.initState();
    _loadSubscription();
  }

  Future<void> _loadSubscription() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final result = await ApiService.instance.getSubscriptionStatus(authProvider.token);
    if (result['success'] == true) {
      setState(() => _subscriptionData = result['data']);
    }
  }

  Future<void> _startTrial() async {
    setState(() => _isLoading = true);
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final result = await ApiService.instance.startTrial(authProvider.token);
    setState(() => _isLoading = false);
    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تفعيل التجربة المجانية لمدة 7 أيام! 🎉'),
            backgroundColor: Colors.green),
      );
      await _loadSubscription();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result['error'] ?? 'فشل في تفعيل التجربة'),
            backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final plan = _subscriptionData?['plan'] ?? 'free';
    final isPremium = _subscriptionData?['is_premium'] == true;
    final trialDays = _subscriptionData?['trial_days_remaining'] ?? 0;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A14),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('خطط الاشتراك', style: TextStyle(color: Colors.white, fontFamily: 'Cairo')),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C63FF), Color(0xFF9C27B0)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  const Icon(Icons.auto_awesome, color: Colors.white, size: 40),
                  const SizedBox(height: 12),
                  const Text('LifeFlow Premium', style: TextStyle(
                    color: Colors.white, fontSize: 22,
                    fontWeight: FontWeight.w900, fontFamily: 'Cairo',
                  )),
                  const SizedBox(height: 8),
                  Text(
                    isPremium
                      ? 'أنت مشترك في البريميوم ✨'
                      : 'اختبر كامل إمكانيات LifeFlow',
                    style: const TextStyle(color: Colors.white70, fontFamily: 'Cairo'),
                    textAlign: TextAlign.center,
                  ),
                  if (plan == 'trial' && trialDays > 0) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'تبقى $trialDays يوم من التجربة',
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'Cairo'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Current Plan Status
            if (!isPremium) ...[
              // Free Plan Card
              _PlanCard(
                title: 'المجاني',
                price: '\$0',
                period: '/شهريًا',
                isCurrentPlan: plan == 'free',
                features: [
                  _Feature('إدارة المهام الأساسية', true),
                  _Feature('تتبع العادات (5 عادات)', true),
                  _Feature('تسجيل المزاج', true),
                  _Feature('تقارير الأداء الذكية', false),
                  _Feature('مراجعة الحياة الأسبوعية', false),
                  _Feature('كشف المماطلة', false),
                  _Feature('خريطة الطاقة', false),
                ],
                buttonText: plan == 'free' ? 'خطتك الحالية' : null,
                onPressed: null,
              ),
              const SizedBox(height: 16),
            ],

            // Premium Plan Card
            _PlanCard(
              title: 'بريميوم',
              price: _billingCycle == 'monthly' ? '\$9.99' : '\$7.99',
              period: '/شهريًا',
              isCurrentPlan: isPremium,
              isPremium: true,
              features: [
                _Feature('كل مزايا المجانية', true),
                _Feature('تقارير الأداء الذكية', true),
                _Feature('مراجعة الحياة الأسبوعية', true),
                _Feature('كشف المماطلة التلقائي', true),
                _Feature('خريطة الطاقة الشخصية', true),
                _Feature('مرشد الذكاء الاصطناعي', true),
                _Feature('تحليل سلوكي متقدم', true),
                _Feature('عادات غير محدودة', true),
              ],
              buttonText: isPremium ? 'مشترك ✓' : 'اشترك الآن',
              onPressed: isPremium ? null : () => _startTrial(),
              isLoading: _isLoading,
            ),

            const SizedBox(height: 16),

            // Trial CTA (for free users who haven't trialed)
            if (!isPremium && plan == 'free') ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1A2E),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.yellow.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.bolt, color: Colors.yellow, size: 28),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('جرّب مجانًا 7 أيام', style: TextStyle(
                            color: Colors.yellow, fontWeight: FontWeight.bold,
                            fontFamily: 'Cairo',
                          )),
                          Text('لا يلزم بطاقة ائتمان',
                            style: TextStyle(color: Colors.grey, fontSize: 12, fontFamily: 'Cairo')),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: _isLoading ? null : _startTrial,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.yellow,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: _isLoading
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                        : const Text('ابدأ', style: TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 24),

            // Features Grid
            const Text('ما ستحصل عليه', style: TextStyle(
              color: Colors.white, fontSize: 16,
              fontWeight: FontWeight.bold, fontFamily: 'Cairo',
            ), textAlign: TextAlign.center),
            const SizedBox(height: 12),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.4,
              children: [
                _FeatureCard('📊', 'تحليل الأداء', 'تقارير ذكية يومية'),
                _FeatureCard('🧠', 'الذكاء الاصطناعي', 'إرشاد شخصي'),
                _FeatureCard('⚡', 'خريطة الطاقة', 'أوقات الذروة'),
                _FeatureCard('🎯', 'كشف المماطلة', 'تنبيهات تلقائية'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// Helper models & widgets
class _Feature {
  final String label;
  final bool included;
  _Feature(this.label, this.included);
}

class _PlanCard extends StatelessWidget {
  final String title, price, period;
  final bool isCurrentPlan;
  final bool isPremium;
  final List<_Feature> features;
  final String? buttonText;
  final VoidCallback? onPressed;
  final bool isLoading;

  const _PlanCard({
    required this.title, required this.price, required this.period,
    required this.features, this.isCurrentPlan = false, this.isPremium = false,
    this.buttonText, this.onPressed, this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isCurrentPlan
            ? Colors.green.withOpacity(0.5)
            : isPremium
            ? const Color(0xFF6C63FF).withOpacity(0.5)
            : Colors.white.withOpacity(0.1),
          width: isPremium ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(title, style: TextStyle(
                color: isPremium ? const Color(0xFF9C8FFF) : Colors.white,
                fontSize: 20, fontWeight: FontWeight.w900, fontFamily: 'Cairo',
              )),
              if (isPremium) ...[
                const SizedBox(width: 6),
                const Icon(Icons.auto_awesome, color: Color(0xFF9C8FFF), size: 18),
              ],
              if (isCurrentPlan)
                Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text('الحالي', style: TextStyle(color: Colors.green, fontSize: 11, fontFamily: 'Cairo')),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(price, style: TextStyle(
                color: isPremium ? const Color(0xFF9C8FFF) : Colors.white,
                fontSize: 28, fontWeight: FontWeight.w900,
              )),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(period, style: const TextStyle(color: Colors.grey, fontSize: 13, fontFamily: 'Cairo')),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...features.map((f) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Icon(
                  f.included ? Icons.check_circle : Icons.cancel,
                  color: f.included ? Colors.green : Colors.grey,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Text(f.label, style: TextStyle(
                  color: f.included ? Colors.white70 : Colors.grey,
                  fontSize: 13, fontFamily: 'Cairo',
                )),
              ],
            ),
          )),
          if (buttonText != null) ...[
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: onPressed,
              style: ElevatedButton.styleFrom(
                backgroundColor: isPremium && onPressed != null
                  ? const Color(0xFF6C63FF)
                  : Colors.grey.withOpacity(0.3),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: isLoading
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(buttonText!, style: const TextStyle(
                    fontFamily: 'Cairo', fontWeight: FontWeight.bold, fontSize: 14)),
            ),
          ],
        ],
      ),
    );
  }
}

Widget _FeatureCard(String icon, String title, String desc) {
  return Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFF1A1A2E),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Colors.white.withOpacity(0.05)),
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(icon, style: const TextStyle(fontSize: 24)),
        const SizedBox(height: 6),
        Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12, fontFamily: 'Cairo')),
        Text(desc, style: const TextStyle(color: Colors.grey, fontSize: 10, fontFamily: 'Cairo')),
      ],
    ),
  );
}
