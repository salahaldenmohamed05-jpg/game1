/**
 * AI Provider - مزود الذكاء الاصطناعي
 * ========================================
 */

import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ChatMessage {
  final String content;
  final bool isUser;
  final DateTime timestamp;

  ChatMessage({
    required this.content,
    required this.isUser,
    required this.timestamp,
  });
}

class AIProvider extends ChangeNotifier {
  final List<ChatMessage> _messages = [];
  bool _isLoading = false;
  List<Map<String, dynamic>> _suggestions = [];

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get isLoading => _isLoading;
  List<Map<String, dynamic>> get suggestions => _suggestions;

  void updateToken(String? token) {
    ApiService.setToken(token);
    if (token != null) {
      loadSuggestions();
      _initWelcomeMessage();
    }
  }

  void _initWelcomeMessage() {
    if (_messages.isEmpty) {
      _messages.add(ChatMessage(
        content: 'مرحباً! أنا مساعدك الذكي في LifeFlow 🌟\n\nيمكنني مساعدتك في:\n• إدارة مهامك وأهدافك\n• تتبع عاداتك اليومية\n• تحليل مزاجك وصحتك النفسية\n• تقديم اقتراحات مخصصة لك\n\nكيف يمكنني مساعدتك اليوم؟',
        isUser: false,
        timestamp: DateTime.now(),
      ));
      notifyListeners();
    }
  }

  Future<void> sendMessage(String message) async {
    if (message.trim().isEmpty) return;

    _messages.add(ChatMessage(
      content: message,
      isUser: true,
      timestamp: DateTime.now(),
    ));
    _isLoading = true;
    notifyListeners();

    try {
      final result = await ApiService.sendMessage(message);

      if (result['success']) {
        final data = result['data'];
        final reply = data['data']?['response'] ??
            data['data']?['message'] ??
            data['message'] ??
            'لا يوجد رد';
        _messages.add(ChatMessage(
          content: reply,
          isUser: false,
          timestamp: DateTime.now(),
        ));
      } else {
        _messages.add(ChatMessage(
          content: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.',
          isUser: false,
          timestamp: DateTime.now(),
        ));
      }
    } catch (e) {
      _messages.add(ChatMessage(
        content: 'تعذر الاتصال بالخادم.',
        isUser: false,
        timestamp: DateTime.now(),
      ));
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadSuggestions() async {
    try {
      final result = await ApiService.getAISuggestions();
      if (result['success']) {
        final data = result['data']['data'];
        _suggestions = (data['suggestions'] as List<dynamic>?)
            ?.map((s) => s as Map<String, dynamic>)
            .toList() ?? [];
        notifyListeners();
      }
    } catch (e) {
      // Ignore
    }
  }

  void clearMessages() {
    _messages.clear();
    _initWelcomeMessage();
    notifyListeners();
  }
}
