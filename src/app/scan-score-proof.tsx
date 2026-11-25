import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStudy } from '@/context/StudyContext';
import { extractTextFromImage } from '@/services/tesseract';
import { useTheme } from '@/theme';
import type { Assessment } from '@/db/studytrack';

const CATEGORIES = [
  { id: 'quiz', label: 'Quiz' },
  { id: 'exam', label: 'Major Exam' },
  { id: 'activity', label: 'Activity' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'project', label: 'Project' },
  { id: 'recitation', label: 'Recitation' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'other', label: 'Other' },
] as const;

/** Try to detect "X/Y" or "X out of Y" score patterns. */
export function detectScore(text: string): { raw: number; total: number } | null {
  // Match patterns like "18/20", "18 / 20", "18 out of 20"
  const patterns = [
    /\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/,
    /\b(\d+(?:\.\d+)?)\s+out\s+of\s+(\d+(?:\.\d+)?)\b/i,
    /score[:\s]+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const raw = parseFloat(m[1]);
      const total = parseFloat(m[2]);
      if (!isNaN(raw) && !isNaN(total) && total > 0 && raw <= total) {
        return { raw, total };
      }
    }
  }
  return null;
}

async function extractScoreFromImage(
  base64: string,
  mimeType: string
): Promise<{ raw: number; total: number; text: string } | null> {
  try {
    const geminiModule = await import('@/ai/gemini').catch(() => null);
    if (geminiModule && typeof geminiModule.generateContent === 'function') {
      const result = await geminiModule.generateContent({
        prompt: `Look at this image of a scored academic paper or assessment.
Find the student's score and the maximum possible score.
Return ONLY a JSON object like {"raw":18,"total":20,"confidence":"high"}.
If you cannot confidently identify the score, return {"raw":null,"total":null,"confidence":"low"}.
Do not include any other text.`,
        imageBase64: base64,
        imageMimeType: mimeType,
      });

      const text = (result?.text || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed.raw !== null && parsed.total !== null && !isNaN(Number(parsed.raw)) && !isNaN(Number(parsed.total))) {
        return { raw: Number(parsed.raw), total: Number(parsed.total), text: '' };
      }
    }
  } catch {
    // Fall through to OCR fallback
  }

  // Fallback: On-device Tesseract OCR (with cloud fallback)
  try {
    const ocrResult = await extractTextFromImage(base64, mimeType);
    if (ocrResult.text.trim()) {
      const detected = detectScore(ocrResult.text);
      if (detected) {
        return { ...detected, text: ocrResult.text };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export default function ScanScoreProofScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ assessmentId?: string; subjectId?: string; source?: string }>();
  const { subjects, assessments, createAssessment, editAssessment, activePeriod } = useStudy();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Detected score suggestion
  const [suggestedRaw, setSuggestedRaw] = useState<number | null>(null);
  const [suggestedTotal, setSuggestedTotal] = useState<number | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  // Form
  const initialAssessment = params.assessmentId ? assessments.find((a) => a.id === params.assessmentId) : null;
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    params.subjectId || initialAssessment?.subject_id || subjects[0]?.id || ''
  );
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>(params.assessmentId || '');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<Assessment['category']>('quiz');
  const [formCustomCategory, setFormCustomCategory] = useState('');
  const [formRaw, setFormRaw] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formWeight, setFormWeight] = useState('20');

  const [subjectPickerVisible, setSubjectPickerVisible] = useState(false);
  const [assessmentPickerVisible, setAssessmentPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const runAnalysis = async (b64: string, mime: string) => {
    setIsAnalyzing(true);
    try {
      const detected = await extractScoreFromImage(b64, mime);
      if (detected) {
        setSuggestedRaw(detected.raw);
        setSuggestedTotal(detected.total);
        setShowSuggestion(true);
      }
    } catch {
      // Ignore — user fills manually
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    const b64 = asset.base64 ?? null;
    setImageBase64(b64);
    setImageMimeType(asset.mimeType || 'image/jpeg');
    setShowSuggestion(false);
    if (b64) await runAnalysis(b64, asset.mimeType || 'image/jpeg');
  };

  const handleTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera Permission', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    const b64 = asset.base64 ?? null;
    setImageBase64(b64);
    setImageMimeType(asset.mimeType || 'image/jpeg');
    setShowSuggestion(false);
    if (b64) await runAnalysis(b64, asset.mimeType || 'image/jpeg');
  };

  // Auto-fill from route parameters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (params.source === 'camera') {
        void handleTakePhoto();
      } else if (params.source === 'gallery') {
        void handlePickImage();
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.source]);

  const subjectAssessments = assessments.filter((a) => a.subject_id === selectedSubjectId);

  const applySuggestion = () => {
    if (suggestedRaw !== null) setFormRaw(String(suggestedRaw));
    if (suggestedTotal !== null) setFormTotal(String(suggestedTotal));
    setShowSuggestion(false);
  };

  const handleSave = async () => {
    const raw = parseFloat(formRaw);
    const total = parseFloat(formTotal);

    if (!imageUri) {
      Alert.alert('No Image', 'Please select or capture a score proof image first.');
      return;
    }
    if (!selectedSubjectId) {
      Alert.alert('No Subject', 'Please select a subject.');
      return;
    }
    if (isNaN(raw) || isNaN(total) || total <= 0) {
      Alert.alert('Invalid Score', 'Please enter a valid raw score and total items.');
      return;
    }
    if (raw > total) {
      Alert.alert('Invalid Score', 'Raw score cannot exceed total items.');
      return;
    }

    // Determine evidence URI — use local URI on native, base64 data URL on web
    const evidenceUri =
      Platform.OS === 'web' && imageBase64
        ? `data:${imageMimeType};base64,${imageBase64}`
        : imageUri;

    setIsSaving(true);
    try {
      if (selectedAssessmentId) {
        // Attach to existing assessment — only update evidence_uri, never silently change score
        await editAssessment(selectedAssessmentId, { evidence_uri: evidenceUri });
        Alert.alert(
          'Evidence Attached',
          'The score proof has been attached to the existing assessment. The score was NOT changed.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        // Create new assessment with evidence
        if (!formTitle.trim()) {
          Alert.alert('Title Required', 'Please enter an assessment title.');
          setIsSaving(false);
          return;
        }
        await createAssessment({
          subject_id: selectedSubjectId,
          period_id: activePeriod?.id,
          title: formTitle.trim(),
          category: formCategory,
          custom_category: formCustomCategory.trim() || undefined,
          raw_score: raw,
          total_items: total,
          weight_percent: 0,
          date: formDate,
          evidence_uri: evidenceUri,
        });
        Alert.alert(
          'Assessment Recorded',
          'Score and proof saved successfully.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch {
      Alert.alert('Save Failed', 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const th = theme;
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedAssessment = assessments.find((a) => a.id === selectedAssessmentId);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: th.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="chevron-back" size={24} color={th.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: th.text, textAlign: 'center' }}>
          Scan Score Proof
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={{ color: th.textSecondary, fontSize: 13, marginBottom: 16 }}>
        Upload or photograph a graded paper. AI will try to read the score.
        You must confirm any detected values before they are saved.
      </Text>

      {/* Image pickers */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={handlePickImage}
          style={{ flex: 1, backgroundColor: '#0EA5E9', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="images-outline" size={22} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>Gallery</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && (
          <TouchableOpacity
            onPress={handleTakePhoto}
            style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="camera-outline" size={22} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 12 }}>Camera</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Preview */}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 14, backgroundColor: th.card }}
          resizeMode="contain"
        />
      ) : null}

      {/* Analyzing */}
      {isAnalyzing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: th.card, borderRadius: 10, marginBottom: 12 }}>
          <ActivityIndicator color={th.primary} />
          <Text style={{ color: th.textSecondary }}>Reading score with AI…</Text>
        </View>
      )}

      {/* AI suggestion */}
      {showSuggestion && suggestedRaw !== null && suggestedTotal !== null && (
        <View style={{ backgroundColor: th.card, borderWidth: 1, borderColor: '#10B981', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Ionicons name="sparkles-outline" size={18} color="#10B981" />
            <Text style={{ color: th.text, fontWeight: '700', fontSize: 15 }}>AI Detected Score</Text>
          </View>
          <Text style={{ color: th.textSecondary, fontSize: 14, marginBottom: 12 }}>
            The AI found: <Text style={{ color: th.text, fontWeight: '700' }}>{suggestedRaw} / {suggestedTotal}</Text>
            {'\n'}Please verify this matches your paper before accepting.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowSuggestion(false)}
              style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: th.border }}
            >
              <Text style={{ color: th.textSecondary }}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applySuggestion}
              style={{ flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#10B981' }}
            >
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Apply Score</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- Assessment Link --- */}
      <View style={{ backgroundColor: th.card, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <Text style={{ color: th.text, fontWeight: '700', fontSize: 15, marginBottom: 12 }}>Link to Assessment</Text>

        {/* Subject */}
        <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>Subject</Text>
        <TouchableOpacity
          onPress={() => setSubjectPickerVisible(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: th.border, marginBottom: 12, backgroundColor: th.inputBackground }}
        >
          <Text style={{ color: th.text, fontSize: 14 }}>
            {selectedSubject ? `${selectedSubject.code} — ${selectedSubject.name}` : 'Select Subject'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={th.textSecondary} />
        </TouchableOpacity>

        {/* Attach to existing OR create new */}
        <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
          Attach to Existing Assessment (optional)
        </Text>
        <TouchableOpacity
          onPress={() => setAssessmentPickerVisible(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: th.border, marginBottom: 4, backgroundColor: th.inputBackground }}
        >
          <Text style={{ color: th.text, fontSize: 14 }} numberOfLines={1}>
            {selectedAssessment ? selectedAssessment.title : 'Create new assessment'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={th.textSecondary} />
        </TouchableOpacity>
        {selectedAssessmentId ? (
          <Text style={{ color: '#F59E0B', fontSize: 11, marginBottom: 8 }}>
            ⚠️ Attaching proof will NOT change the saved score. Only the evidence file will be updated.
          </Text>
        ) : null}
      </View>

      {/* --- Create new assessment form (only if not linking to existing) --- */}
      {!selectedAssessmentId && (
        <View style={{ backgroundColor: th.card, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <Text style={{ color: th.text, fontWeight: '700', fontSize: 15, marginBottom: 12 }}>New Assessment Details</Text>

          <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Title *</Text>
          <TextInput
            style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border, marginBottom: 12 }}
            value={formTitle}
            onChangeText={setFormTitle}
            placeholder="e.g. Quiz 1"
            placeholderTextColor={th.textSecondary}
          />

          {(() => {
            let customCats: { id: string; name: string; weight?: number }[] = [];
            if (selectedSubject?.grading_categories) {
              try {
                const parsed = JSON.parse(selectedSubject.grading_categories);
                if (Array.isArray(parsed) && parsed.length > 0) customCats = parsed;
              } catch {}
            }

            return (
              <>
                {customCats.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                      Course Categories
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {customCats.map((cc) => {
                        const isSel = formCustomCategory === cc.name;
                        return (
                          <TouchableOpacity
                            key={cc.id}
                            onPress={() => {
                              setFormCustomCategory(cc.name);
                              setFormWeight(String(cc.weight ?? 20));
                              const lower = cc.name.toLowerCase();
                              if (lower.includes('exam')) setFormCategory('exam');
                              else if (lower.includes('quiz')) setFormCategory('quiz');
                              else if (lower.includes('proj')) setFormCategory('project');
                              else if (lower.includes('lab') || lower.includes('activ')) setFormCategory('activity');
                              else if (lower.includes('attend')) setFormCategory('attendance');
                              else setFormCategory('other');
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 8,
                              backgroundColor: isSel ? th.primary : 'rgba(100,100,100,0.12)',
                            }}
                          >
                            <Text style={{ color: isSel ? '#FFF' : th.text, fontSize: 12, fontWeight: isSel ? '700' : '400' }}>
                              {cc.name} ({cc.weight}%)
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>Standard Category</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => {
                        setFormCategory(cat.id as Assessment['category']);
                        setFormCustomCategory('');
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: !formCustomCategory && formCategory === cat.id ? th.primary : 'rgba(100,100,100,0.12)' }}
                    >
                      <Text style={{ color: !formCustomCategory && formCategory === cat.id ? '#FFF' : th.text, fontSize: 12 }}>{cat.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border, marginBottom: 12 }}
                  value={formCustomCategory}
                  onChangeText={setFormCustomCategory}
                  placeholder="Or enter custom category label (e.g. Lab Exam)"
                  placeholderTextColor={th.textSecondary}
                />
              </>
            );
          })()}

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Raw Score *</Text>
              <TextInput
                style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border }}
                value={formRaw}
                onChangeText={setFormRaw}
                keyboardType="decimal-pad"
                placeholder="e.g. 18"
                placeholderTextColor={th.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Total Items *</Text>
              <TextInput
                style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border }}
                value={formTotal}
                onChangeText={setFormTotal}
                keyboardType="decimal-pad"
                placeholder="e.g. 20"
                placeholderTextColor={th.textSecondary}
              />
            </View>
          </View>

          <View style={{ marginBottom: 4 }}>
            <Text style={{ color: th.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>Date</Text>
            <TextInput
              style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: th.inputBackground, color: th.text, borderColor: th.border }}
              value={formDate}
              onChangeText={setFormDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={th.textSecondary}
            />
            <Text style={{ color: th.textSecondary, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
              ℹ Category weight is automatically calculated from the selected course breakdown.
            </Text>
          </View>
        </View>
      )}

      {/* Save */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={isSaving || !imageUri}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, backgroundColor: imageUri ? th.primary : th.border, marginTop: 8 }}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="save-outline" size={20} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>
              {selectedAssessmentId ? 'Attach Evidence' : 'Save Assessment + Proof'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Subject picker modal */}
      <Modal visible={subjectPickerVisible} transparent animationType="slide" onRequestClose={() => setSubjectPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: th.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <Text style={{ color: th.text, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>Select Subject</Text>
            <ScrollView>
              {subjects.length === 0 && (
                <Text style={{ color: th.textSecondary, textAlign: 'center', padding: 20 }}>No subjects yet. Add subjects first.</Text>
              )}
              {subjects.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  onPress={() => {
                    setSelectedSubjectId(sub.id);
                    setSelectedAssessmentId('');
                    setSubjectPickerVisible(false);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, marginBottom: 6, backgroundColor: selectedSubjectId === sub.id ? th.primary + '22' : 'transparent' }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sub.color }} />
                  <Text style={{ color: th.text, fontWeight: '600', flex: 1 }}>{sub.code} — {sub.name}</Text>
                  {selectedSubjectId === sub.id && <Ionicons name="checkmark-circle" size={18} color={th.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setSubjectPickerVisible(false)} style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: th.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Assessment picker modal */}
      <Modal visible={assessmentPickerVisible} transparent animationType="slide" onRequestClose={() => setAssessmentPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: th.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' }}>
            <Text style={{ color: th.text, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>Select Assessment</Text>
            <ScrollView>
              <TouchableOpacity
                onPress={() => { setSelectedAssessmentId(''); setAssessmentPickerVisible(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, marginBottom: 6, backgroundColor: !selectedAssessmentId ? th.primary + '22' : 'transparent' }}
              >
                <Ionicons name="add-circle-outline" size={18} color={th.primary} />
                <Text style={{ color: th.text, fontWeight: '600' }}>Create new assessment</Text>
                {!selectedAssessmentId && <Ionicons name="checkmark-circle" size={18} color={th.primary} />}
              </TouchableOpacity>
              {subjectAssessments.length === 0 && (
                <Text style={{ color: th.textSecondary, textAlign: 'center', padding: 12 }}>No assessments for this subject yet.</Text>
              )}
              {subjectAssessments.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => { setSelectedAssessmentId(a.id); setAssessmentPickerVisible(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, marginBottom: 6, backgroundColor: selectedAssessmentId === a.id ? th.primary + '22' : 'transparent' }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.text, fontWeight: '600', fontSize: 14 }}>{a.title}</Text>
                    <Text style={{ color: th.textSecondary, fontSize: 12 }}>{a.category} · {a.raw_score}/{a.total_items}</Text>
                  </View>
                  {selectedAssessmentId === a.id && <Ionicons name="checkmark-circle" size={18} color={th.primary} />}
                  {Boolean(a.evidence_uri) && <Ionicons name="image-outline" size={14} color="#10B981" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setAssessmentPickerVisible(false)} style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: th.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
