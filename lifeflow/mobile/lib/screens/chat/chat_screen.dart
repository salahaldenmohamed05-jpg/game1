/**
 * Chat Screen - شاشة المحادثة مع المساعد الذكي
 * ================================================
 * المحادثة مع LifeFlow AI Assistant
 */

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/ai_provider.dart';
import '../../utils/app_constants.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();

  // Quick suggestion messages
  final List<String> _quickMessages = [
    'ما هي أهم مهامي اليوم؟',
    'كيف أحسّن إنتاجيتي؟',
    'اقترح عادات صحية',
    'تحليل مزاجي هذا الأسبوع',
    'نصائح للتركيز والتحفيز',
    'ما العادة التالية المطلوبة منّي؟',
  ];

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage(String? message) {
    final text = message ?? _messageController.text.trim();
    if (text.isEmpty) return;

    context.read<AIProvider>().sendMessage(text);
    _messageController.clear();

    // Scroll to bottom
    Future.delayed(const Duration(milliseconds: 200), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final aiProvider = context.watch<AIProvider>();

    return Scaffold(
      backgroundColor: AppConstants.darkBackground,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: AppConstants.primaryGradient,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text('✨', style: TextStyle(fontSize: 18)),
              ),
            ),
            const SizedBox(width: 10),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'LifeFlow AI',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppConstants.textPrimary,
                  ),
                ),
                Text(
                  'مساعدك الشخصي الذكي',
                  style: TextStyle(
                    fontFamily: AppConstants.fontFamily,
                    fontSize: 11,
                    color: AppConstants.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, size: 20),
            onPressed: () => context.read<AIProvider>().clearMessages(),
            tooltip: 'محادثة جديدة',
          ),
        ],
      ),
      body: Column(
        children: [
          // Messages List
          Expanded(
            child: aiProvider.messages.isEmpty
                ? _WelcomeScreen(
                    onQuickMessage: _sendMessage,
                    quickMessages: _quickMessages,
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: aiProvider.messages.length +
                        (aiProvider.isLoading ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == aiProvider.messages.length) {
                        return const _TypingIndicator();
                      }
                      final msg = aiProvider.messages[index];
                      return _MessageBubble(
                        content: msg.content,
                        isUser: msg.isUser,
                        timestamp: msg.timestamp,
                      );
                    },
                  ),
          ),

          // Quick suggestions
          if (aiProvider.messages.length > 0 && !aiProvider.isLoading)
            _QuickSuggestions(
              suggestions: _quickMessages.take(3).toList(),
              onTap: _sendMessage,
            ),

          // Input Area
          _ChatInput(
            controller: _messageController,
            isLoading: aiProvider.isLoading,
            onSend: () => _sendMessage(null),
          ),
        ],
      ),
    );
  }
}

// Welcome Screen (before first message)
class _WelcomeScreen extends StatelessWidget {
  final Function(String) onQuickMessage;
  final List<String> quickMessages;

  const _WelcomeScreen({
    required this.onQuickMessage,
    required this.quickMessages,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 20),
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              gradient: AppConstants.primaryGradient,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppConstants.primaryPurple.withOpacity(0.3),
                  blurRadius: 20,
                  spreadRadius: 5,
                ),
              ],
            ),
            child: const Center(
              child: Text('✨', style: TextStyle(fontSize: 40)),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'مرحباً! أنا LifeFlow AI',
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppConstants.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'مساعدك الشخصي لإدارة الوقت والإنتاجية\nكيف يمكنني مساعدتك اليوم؟',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppConstants.fontFamily,
              fontSize: 14,
              color: AppConstants.textMuted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 32),

          // Feature Grid
          const _FeatureGrid(),
          const SizedBox(height: 32),

          const Align(
            alignment: Alignment.centerRight,
            child: Text(
              'اقتراحات سريعة',
              style: TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 13,
                color: AppConstants.textMuted,
              ),
            ),
          ),
          const SizedBox(height: 10),

          ...quickMessages.map((msg) => _QuickMessageButton(
                message: msg,
                onTap: () => onQuickMessage(msg),
              )),
        ],
      ),
    );
  }
}

class _FeatureGrid extends StatelessWidget {
  const _FeatureGrid();

  @override
  Widget build(BuildContext context) {
    final features = [
      {'icon': '📋', 'label': 'إدارة المهام'},
      {'icon': '🏃', 'label': 'تتبع العادات'},
      {'icon': '💭', 'label': 'تحليل المزاج'},
      {'icon': '💡', 'label': 'نصائح ذكية'},
    ];

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.5,
      children: features.map((f) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppConstants.darkCard,
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          border: Border.all(color: AppConstants.darkBorder),
        ),
        child: Row(
          children: [
            Text(f['icon']!, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 8),
            Text(
              f['label']!,
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                fontSize: 12,
                color: AppConstants.textSecondary,
              ),
            ),
          ],
        ),
      )).toList(),
    );
  }
}

class _QuickMessageButton extends StatelessWidget {
  final String message;
  final VoidCallback onTap;

  const _QuickMessageButton({required this.message, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppConstants.darkCard,
          borderRadius: BorderRadius.circular(AppConstants.radiusM),
          border: Border.all(color: AppConstants.darkBorder),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.arrow_forward_ios,
              size: 12,
              color: AppConstants.primaryPurple,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 13,
                  color: AppConstants.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Message Bubble
class _MessageBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final DateTime timestamp;

  const _MessageBubble({
    required this.content,
    required this.isUser,
    required this.timestamp,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isUser ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.80,
        ),
        child: Column(
          crossAxisAlignment: isUser ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                gradient: isUser
                    ? LinearGradient(
                        colors: [
                          AppConstants.primaryPurple,
                          AppConstants.primaryPurple.withOpacity(0.8),
                        ],
                      )
                    : null,
                color: isUser ? null : AppConstants.darkCard,
                borderRadius: BorderRadius.only(
                  topRight: const Radius.circular(16),
                  topLeft: const Radius.circular(16),
                  bottomLeft: isUser ? Radius.zero : const Radius.circular(16),
                  bottomRight: isUser ? const Radius.circular(16) : Radius.zero,
                ),
                border: isUser
                    ? null
                    : Border.all(color: AppConstants.darkBorder),
              ),
              child: Text(
                content,
                style: TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 14,
                  color: isUser ? Colors.white : AppConstants.textPrimary,
                  height: 1.5,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
              child: Text(
                '${timestamp.hour.toString().padLeft(2, '0')}:${timestamp.minute.toString().padLeft(2, '0')}',
                style: const TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 10,
                  color: AppConstants.textMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Typing Indicator
class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with TickerProviderStateMixin {
  late List<AnimationController> _controllers;
  late List<Animation<double>> _animations;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(
      3,
      (i) => AnimationController(
        duration: const Duration(milliseconds: 600),
        vsync: this,
      )..repeat(reverse: true, period: Duration(milliseconds: 600 + (i * 200))),
    );
    _animations = _controllers
        .map((c) => Tween<double>(begin: 0, end: 6).animate(c))
        .toList();
  }

  @override
  void dispose() {
    for (var c in _controllers) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppConstants.darkCard,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
          ),
          border: Border.all(color: AppConstants.darkBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            return AnimatedBuilder(
              animation: _animations[i],
              builder: (context, child) {
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: 8,
                  height: 8 + _animations[i].value,
                  decoration: BoxDecoration(
                    color: AppConstants.primaryPurple.withOpacity(0.6),
                    shape: BoxShape.circle,
                  ),
                );
              },
            );
          }),
        ),
      ),
    );
  }
}

// Quick Suggestions (inline in chat)
class _QuickSuggestions extends StatelessWidget {
  final List<String> suggestions;
  final Function(String) onTap;

  const _QuickSuggestions({required this.suggestions, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: suggestions.length,
        itemBuilder: (_, index) {
          return GestureDetector(
            onTap: () => onTap(suggestions[index]),
            child: Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AppConstants.primaryPurple.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppConstants.primaryPurple.withOpacity(0.3),
                ),
              ),
              child: Text(
                suggestions[index],
                style: const TextStyle(
                  fontFamily: AppConstants.fontFamily,
                  fontSize: 11,
                  color: AppConstants.primaryPurple,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// Chat Input
class _ChatInput extends StatelessWidget {
  final TextEditingController controller;
  final bool isLoading;
  final VoidCallback onSend;

  const _ChatInput({
    required this.controller,
    required this.isLoading,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: AppConstants.darkSurface,
        border: const Border(
          top: BorderSide(color: AppConstants.darkBorder),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              style: const TextStyle(
                fontFamily: AppConstants.fontFamily,
                color: AppConstants.textPrimary,
                fontSize: 14,
              ),
              decoration: InputDecoration(
                hintText: 'اكتب رسالة...',
                filled: true,
                fillColor: AppConstants.darkCard,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppConstants.darkBorder),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppConstants.darkBorder),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(
                    color: AppConstants.primaryPurple,
                    width: 1.5,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          AnimatedContainer(
            duration: AppConstants.animFast,
            child: GestureDetector(
              onTap: isLoading ? null : onSend,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: AppConstants.primaryGradient,
                  shape: BoxShape.circle,
                  boxShadow: isLoading
                      ? null
                      : [
                          BoxShadow(
                            color: AppConstants.primaryPurple.withOpacity(0.4),
                            blurRadius: 10,
                            spreadRadius: 2,
                          ),
                        ],
                ),
                child: isLoading
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(
                        Icons.send_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
