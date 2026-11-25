import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@/theme';

interface FloatingQuickActionProps {
  onAddTask?: () => void;
  onAddCourse?: () => void;
  onAddAssessment?: () => void;
  onAddSchedule?: () => void;
  onOpenTimer?: () => void;
  onSwitchPeriod?: () => void;
  onScanScoreProof?: () => void;
}

export function FloatingQuickAction({
  onAddTask,
  onAddCourse,
  onAddAssessment,
  onAddSchedule,
  onOpenTimer,
  onSwitchPeriod,
  onScanScoreProof,
}: FloatingQuickActionProps) {
  const router = useRouter();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [animValue] = useState(() => new Animated.Value(0));

  const toggleOpen = () => {
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(animValue, {
      toValue,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const handleAction = (action?: () => void) => {
    toggleOpen();
    if (action) {
      setTimeout(action, 150);
    }
  };

  const rotation = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const actions = [
    {
      id: 'task',
      label: 'Add Task',
      icon: 'checkbox-outline' as const,
      color: '#3B82F6',
      action: onAddTask,
    },
    {
      id: 'course',
      label: 'Add Course',
      icon: 'book-outline' as const,
      color: '#06B6D4',
      action: onAddCourse,
    },
    {
      id: 'assessment',
      label: 'Record Grade / Score',
      icon: 'school-outline' as const,
      color: '#8B5CF6',
      action: onAddAssessment,
    },
    {
      id: 'schedule',
      label: 'Add Class Schedule',
      icon: 'time-outline' as const,
      color: '#10B981',
      action: onAddSchedule || (() => router.push('/scan-schedule' as never)),
    },
    {
      id: 'scan_proof',
      label: 'Scan Score Proof',
      icon: 'receipt-outline' as const,
      color: '#F97316',
      action: onScanScoreProof || (() => router.push('/scan-score-proof')),
    },
    {
      id: 'timer',
      label: 'Start Focus Timer',
      icon: 'flame-outline' as const,
      color: '#F59E0B',
      action: onOpenTimer,
    },
    {
      id: 'period',
      label: 'Academic Period',
      icon: 'calendar-outline' as const,
      color: '#6366F1',
      action: onSwitchPeriod,
    },
  ];


  return (
    <>
      {open && (
        <Pressable style={styles.backdrop} onPress={toggleOpen} />
      )}

      <View style={styles.container} pointerEvents="box-none">
        {open && (
          <View style={styles.actionsContainer} pointerEvents="box-none">
            {actions.map((item, index) => {
              const translateY = animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [20 * (actions.length - index), 0],
              });
              const opacity = animValue.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.4, 1],
              });

              return (
                <Animated.View
                  key={item.id}
                  style={[
                    styles.actionRow,
                    {
                      transform: [{ translateY }],
                      opacity,
                    },
                  ]}
                >
                  <View style={[styles.labelPill, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.actionLabel, { color: theme.text }]}>{item.label}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleAction(item.action)}
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: item.color }]}
                  >
                    <Ionicons name={item.icon} size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Main Floating Action Button */}
        <TouchableOpacity
          onPress={toggleOpen}
          activeOpacity={0.9}
          accessibilityLabel="Quick Actions Menu"
          accessibilityRole="button"
          style={[styles.fab, { backgroundColor: theme.primary }]}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    zIndex: 998,
  },
  container: {
    position: 'absolute',
    right: 18,
    bottom: 84, // positioned nicely above the bottom floating pill bar
    alignItems: 'flex-end',
    zIndex: 999,
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  actionsContainer: {
    alignItems: 'flex-end',
    marginBottom: 12,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
});
