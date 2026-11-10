import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStudy } from '@/context/StudyContext';
import { useTheme } from '@/theme';

interface AcademicPeriodModalProps {
  visible: boolean;
  onClose: () => void;
}

const SEMESTERS = ['First Semester', 'Second Semester', 'Summer / Midyear', 'Trimester 1', 'Trimester 2', 'Trimester 3'];
const SUGGESTED_YEARS = ['AY 2026–2027', 'AY 2025–2026', 'AY 2024–2025'];

export function AcademicPeriodModal({ visible, onClose }: AcademicPeriodModalProps) {
  const theme = useTheme();
  const { academicPeriods, activePeriod, switchAcademicPeriod, createPeriod, removePeriod } = useStudy();

  const [isCreating, setIsCreating] = useState(false);
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [academicYear, setAcademicYear] = useState(SUGGESTED_YEARS[0]);

  const handleSelectPeriod = async (id: string) => {
    try {
      await switchAcademicPeriod(id);
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to switch academic period.');
    }
  };

  const handleCreatePeriod = async () => {
    if (!semester.trim() || !academicYear.trim()) {
      Alert.alert('Missing Info', 'Please select both semester and academic year.');
      return;
    }

    try {
      await createPeriod(semester.trim(), academicYear.trim(), true);
      setIsCreating(false);
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to create academic period.');
    }
  };

  const handleDeletePeriod = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete period "${name}"?`)) {
        void removePeriod(id);
      }
    } else {
      Alert.alert('Delete Academic Period', `Delete "${name}"? Associated subjects will remain in database.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void removePeriod(id) },
      ]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.headerIconWrap, { backgroundColor: theme.primary + '15' }]}>
                <Ionicons name="calendar-outline" size={22} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Academic Period</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Organize subjects & grades by term
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {!isCreating ? (
              <>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>SELECT ACTIVE TERM</Text>

                {academicPeriods.length === 0 ? (
                  <View style={[styles.emptyBox, { borderColor: theme.border }]}>
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      No academic periods set yet.
                    </Text>
                  </View>
                ) : (
                  academicPeriods.map((p) => {
                    const isSelected = activePeriod?.id === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => void handleSelectPeriod(p.id)}
                        style={[
                          styles.periodItem,
                          {
                            backgroundColor: isSelected ? theme.primary + '12' : theme.background,
                            borderColor: isSelected ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <View style={styles.periodLeft}>
                          <View
                            style={[
                              styles.radioCircle,
                              { borderColor: isSelected ? theme.primary : theme.textSecondary },
                            ]}
                          >
                            {isSelected && (
                              <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />
                            )}
                          </View>
                          <View style={styles.periodInfo}>
                            <Text
                              style={[
                                styles.periodSemester,
                                { color: theme.text, fontWeight: isSelected ? '700' : '600' },
                              ]}
                            >
                              {p.semester}
                            </Text>
                            <Text style={[styles.periodYear, { color: theme.textSecondary }]}>
                              {p.academic_year}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.periodRight}>
                          {isSelected && (
                            <View style={[styles.activeBadge, { backgroundColor: theme.primary }]}>
                              <Text style={styles.activeBadgeText}>ACTIVE</Text>
                            </View>
                          )}
                          <TouchableOpacity
                            onPress={() => handleDeletePeriod(p.id, `${p.semester} (${p.academic_year})`)}
                            style={styles.trashBtn}
                          >
                            <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}

                <TouchableOpacity
                  onPress={() => setIsCreating(true)}
                  style={[styles.addPeriodBtn, { borderColor: theme.primary }]}
                >
                  <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                  <Text style={[styles.addPeriodBtnText, { color: theme.primary }]}>
                    Add New Academic Period
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Create New Period Form */
              <View style={styles.createForm}>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>CHOOSE SEMESTER / TERM</Text>
                <View style={styles.chipRow}>
                  {SEMESTERS.map((s) => {
                    const isSel = semester === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setSemester(s)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSel ? theme.primary : theme.background,
                            borderColor: isSel ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                  ACADEMIC YEAR
                </Text>
                <View style={styles.chipRow}>
                  {SUGGESTED_YEARS.map((y) => {
                    const isSel = academicYear === y;
                    return (
                      <TouchableOpacity
                        key={y}
                        onPress={() => setAcademicYear(y)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSel ? theme.primary : theme.background,
                            borderColor: isSel ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: isSel ? '#FFFFFF' : theme.text }]}>
                          {y}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  value={academicYear}
                  onChangeText={setAcademicYear}
                  placeholder="Or custom: e.g. AY 2026–2027"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                      marginTop: 8,
                    },
                  ]}
                />

                <View style={styles.formActionRow}>
                  <TouchableOpacity
                    onPress={() => setIsCreating(false)}
                    style={[styles.cancelBtn, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleCreatePeriod()}
                    style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                  >
                    <Text style={styles.saveBtnText}>Save & Activate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  emptyBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  periodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  periodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  periodInfo: {
    gap: 2,
  },
  periodSemester: {
    fontSize: 15,
  },
  periodYear: {
    fontSize: 12,
  },
  periodRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trashBtn: {
    padding: 4,
  },
  addPeriodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  addPeriodBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  createForm: {},
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  formActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
