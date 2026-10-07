import { useEffect, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { colors, radius, space } from '../theme';

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };
type Rect = { x: number; y: number; w: number; h: number };
type Drag =
  | { kind: 'move'; startX: number; startY: number; orig: Rect }
  | { kind: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; orig: Rect };

const COLORS = ['#E11D48', '#F59E0B', '#111827', '#FFFFFF'];
const HANDLE = 36;
const MIN_CROP = 48;

function toPath(points: Point[]): string {
  if (!points.length) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function contain(imgW: number, imgH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h, scale };
}

function clampCrop(rect: Rect, bounds: Rect): Rect {
  let { x, y, w, h } = rect;
  w = Math.max(MIN_CROP, Math.min(w, bounds.w));
  h = Math.max(MIN_CROP, Math.min(h, bounds.h));
  x = Math.min(Math.max(x, bounds.x), bounds.x + bounds.w - w);
  y = Math.min(Math.max(y, bounds.y), bounds.y + bounds.h - h);
  return { x, y, w, h };
}

function hitHandle(x: number, y: number, crop: Rect): Drag['kind'] | null {
  const near = (px: number, py: number) => Math.hypot(x - px, y - py) <= HANDLE;
  if (near(crop.x, crop.y)) return 'nw';
  if (near(crop.x + crop.w, crop.y)) return 'ne';
  if (near(crop.x, crop.y + crop.h)) return 'sw';
  if (near(crop.x + crop.w, crop.y + crop.h)) return 'se';
  if (x >= crop.x && x <= crop.x + crop.w && y >= crop.y && y <= crop.y + crop.h) return 'move';
  return null;
}

type Props = {
  uri: string;
  onClose: () => void;
};

export function ImageEdit({ uri, onClose }: Props) {
  const shotRef = useRef<ViewShotRef>(null);
  const stageRef = useRef<View>(null);
  const [imageUri, setImageUri] = useState(uri);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const cropRef = useRef(crop);
  const boundsRef = useRef<ReturnType<typeof contain> | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    Image.getSize(imageUri, (width, height) => setImageSize({ width, height }));
  }, [imageUri]);

  const bounds =
    imageSize.width && canvas.width
      ? contain(imageSize.width, imageSize.height, canvas.width, canvas.height)
      : null;
  cropRef.current = crop;
  boundsRef.current = bounds;

  const enterCrop = () => {
    if (!bounds) return;
    setCrop({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
    setCropMode(true);
    setCurrent(null);
  };

  const applyCrop = async () => {
    if (!bounds || crop.w < 8 || crop.h < 8) {
      setCropMode(false);
      return;
    }
    const originX = Math.max(0, (crop.x - bounds.x) / bounds.scale);
    const originY = Math.max(0, (crop.y - bounds.y) / bounds.scale);
    const width = Math.min(imageSize.width - originX, crop.w / bounds.scale);
    const height = Math.min(imageSize.height - originY, crop.h / bounds.scale);
    if (width < 8 || height < 8) {
      setCropMode(false);
      return;
    }
    setBusy(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(width),
              height: Math.round(height),
            },
          },
        ],
        { compress: 1, format: ImageManipulator.SaveFormat.PNG },
      );
      setImageUri(result.uri);
      setStrokes([]);
      setCropMode(false);
    } finally {
      setBusy(false);
    }
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvas({ width, height });
  };

  const startDraw = (x: number, y: number) => {
    setCurrent({ color, width: 4, points: [{ x, y }] });
  };

  const moveDraw = (x: number, y: number) => {
    setCurrent((stroke) =>
      stroke ? { ...stroke, points: [...stroke.points, { x, y }] } : stroke,
    );
  };

  const endDraw = () => {
    setCurrent((stroke) => {
      if (stroke && stroke.points.length > 1) {
        setStrokes((all) => [...all, stroke]);
      }
      return null;
    });
  };

  const toLocal = (pageX: number, pageY: number) => ({
    x: pageX - originRef.current.x,
    y: pageY - originRef.current.y,
  });

  const cropPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { x, y } = toLocal(event.nativeEvent.pageX, event.nativeEvent.pageY);
        const kind = hitHandle(x, y, cropRef.current);
        if (!kind) {
          drag.current = null;
          return;
        }
        drag.current = { kind, startX: x, startY: y, orig: cropRef.current };
      },
      onPanResponderMove: (event) => {
        const d = drag.current;
        const box = boundsRef.current;
        if (!d || !box) return;
        const { x, y } = toLocal(event.nativeEvent.pageX, event.nativeEvent.pageY);
        const dx = x - d.startX;
        const dy = y - d.startY;
        const o = d.orig;
        let next: Rect;
        if (d.kind === 'move') {
          next = { ...o, x: o.x + dx, y: o.y + dy };
        } else if (d.kind === 'nw') {
          next = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
        } else if (d.kind === 'ne') {
          next = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
        } else if (d.kind === 'sw') {
          next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
        } else {
          next = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
        }
        setCrop(clampCrop(next, { x: box.x, y: box.y, w: box.w, h: box.h }));
      },
      onPanResponderRelease: () => {
        drag.current = null;
      },
      onPanResponderTerminate: () => {
        drag.current = null;
      },
    }),
  ).current;

  const send = async () => {
    try {
      setBusy(true);
      const file = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: 'Gửi thông tin buổi đánh',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const allStrokes = current ? [...strokes, current] : strokes;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.bar}>
        <Pressable onPress={cropMode ? () => setCropMode(false) : onClose} style={styles.barBtn}>
          <Text style={styles.barBtnText}>{cropMode ? 'Hủy cắt' : 'Quay lại'}</Text>
        </Pressable>
        <Text style={styles.title}>{cropMode ? 'Cắt ảnh' : 'Chỉnh ảnh'}</Text>
        {cropMode ? (
          <Pressable onPress={() => void applyCrop()} style={styles.barBtn} disabled={busy}>
            <Text style={styles.barBtnText}>{busy ? '…' : 'Cắt'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setStrokes((all) => all.slice(0, -1))}
            style={styles.barBtn}
            disabled={!strokes.length}
          >
            <Text style={[styles.barBtnText, !strokes.length && styles.disabled]}>Hoàn tác</Text>
          </Pressable>
        )}
      </View>

      <View
        ref={stageRef}
        style={styles.stage}
        onLayout={(event) => {
          onLayout(event);
          stageRef.current?.measureInWindow((x, y) => {
            originRef.current = { x, y };
          });
        }}
      >
        <ViewShot ref={shotRef} style={styles.canvas} options={{ format: 'png', result: 'tmpfile' }}>
          <View
            style={styles.canvas}
            onStartShouldSetResponder={() => !cropMode}
            onMoveShouldSetResponder={() => !cropMode}
            onResponderGrant={(event) =>
              startDraw(event.nativeEvent.locationX, event.nativeEvent.locationY)
            }
            onResponderMove={(event) =>
              moveDraw(event.nativeEvent.locationX, event.nativeEvent.locationY)
            }
            onResponderRelease={endDraw}
            onResponderTerminate={endDraw}
          >
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
            {canvas.width > 0 ? (
              <Svg width={canvas.width} height={canvas.height} style={StyleSheet.absoluteFill} pointerEvents="none">
                {allStrokes.map((stroke, index) => (
                  <Path
                    key={index}
                    d={toPath(stroke.points)}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
            ) : null}
          </View>
        </ViewShot>

        {cropMode && crop.w > 0 ? (
          <View style={StyleSheet.absoluteFill} {...cropPan.panHandlers}>
            <View pointerEvents="none" style={[styles.mask, { height: Math.max(0, crop.y) }]} />
            <View
              pointerEvents="none"
              style={[styles.mask, { top: crop.y, width: Math.max(0, crop.x), height: crop.h }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.mask,
                { top: crop.y, left: crop.x + crop.w, right: 0, height: crop.h },
              ]}
            />
            <View
              pointerEvents="none"
              style={[styles.mask, { top: crop.y + crop.h, left: 0, right: 0, bottom: 0 }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.cropBox,
                { left: crop.x, top: crop.y, width: crop.w, height: crop.h },
              ]}
            >
              <View style={[styles.handle, styles.handleNW]} />
              <View style={[styles.handle, styles.handleNE]} />
              <View style={[styles.handle, styles.handleSW]} />
              <View style={[styles.handle, styles.handleSE]} />
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.tools}>
        {COLORS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setColor(item)}
            style={[
              styles.swatch,
              { backgroundColor: item },
              color === item && styles.swatchOn,
              item === '#FFFFFF' && styles.swatchWhite,
            ]}
          />
        ))}
        <Pressable onPress={() => setStrokes([])} style={styles.clearBtn}>
          <Text style={styles.clearText}>Xóa vẽ</Text>
        </Pressable>
        <Pressable onPress={enterCrop} style={styles.clearBtn} disabled={cropMode || busy}>
          <Text style={styles.clearText}>Cắt</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => void send()} style={styles.send} disabled={busy || cropMode}>
        <Text style={styles.sendText}>{busy ? 'Đang xử lý…' : 'Gửi ảnh'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B5C38',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  title: {
    color: colors.primaryText,
    fontSize: 17,
    fontWeight: '800',
  },
  barBtn: {
    minWidth: 72,
    paddingVertical: 8,
  },
  barBtnText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
  stage: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#0B5C38',
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  mask: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primaryText,
  },
  handle: {
    position: 'absolute',
    width: 22,
    height: 22,
    backgroundColor: colors.primaryText,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  handleNW: { top: -11, left: -11 },
  handleNE: { top: -11, right: -11 },
  handleSW: { bottom: -11, left: -11 },
  handleSE: { bottom: -11, right: -11 },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  swatchOn: {
    borderWidth: 3,
    borderColor: colors.primaryText,
  },
  swatchWhite: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  clearBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearText: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  send: {
    marginHorizontal: space.md,
    marginBottom: 8,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
});
