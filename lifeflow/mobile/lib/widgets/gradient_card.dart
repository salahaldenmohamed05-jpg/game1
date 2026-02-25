/**
 * Gradient Card Widget - بطاقة التدرج
 */

import 'package:flutter/material.dart';
import '../utils/app_constants.dart';

class GradientCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final List<Color>? colors;
  final BorderRadius? borderRadius;
  final VoidCallback? onTap;

  const GradientCard({
    super.key,
    required this.child,
    this.padding,
    this.colors,
    this.borderRadius,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: padding ?? const EdgeInsets.all(AppConstants.paddingM),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: colors ?? [
              AppConstants.primaryPurple.withOpacity(0.2),
              AppConstants.secondaryTeal.withOpacity(0.1),
            ],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: borderRadius ?? BorderRadius.circular(AppConstants.radiusL),
          border: Border.all(
            color: (colors?.first ?? AppConstants.primaryPurple).withOpacity(0.2),
          ),
        ),
        child: child,
      ),
    );
  }
}

// ============================================================

/**
 * Stat Card Widget - بطاقة الإحصائيات
 */

class StatCard extends StatelessWidget {
  final String emoji;
  final String label;
  final String value;
  final Color color;
  final VoidCallback? onTap;

  const StatCard({
    super.key,
    required this.emoji,
    required this.label,
    required this.value,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(AppConstants.paddingM),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color.withOpacity(0.15), color.withOpacity(0.05)],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: BorderRadius.circular(AppConstants.radiusL),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(emoji, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontFamily: AppConstants.fontFamily,
                      fontSize: 11,
                      color: AppConstants.textMuted,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
