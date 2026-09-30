-- Seed: seed.sql
-- State 37: Catalog, Fonts, Templates & Deterministic Example Orders

-- 1. Products
insert into public.products (id, slug, name, product_type, active, metadata)
values
  (
    'card',
    'card',
    'Thiệp chúc mừng',
    'card',
    true,
    jsonb_build_object(
      'englishName', 'Greeting Card',
      'cardTitle', 'Thiệp',
      'tagline', 'Lời nhắn gửi chân thành lưu giữ trọn vẹn',
      'description', 'Thiệp gập đôi cứng cáp, bề mặt giấy mỹ thuật gân nhẹ bắt mực, tặng kèm phong bì kraft xinh xắn.',
      'startingPrice', 29000,
      'paperSpecs', jsonb_build_object(
        'paperType', 'Giấy mỹ thuật gân kem 250gsm cứng cáp',
        'printSurfaces', 'Tùy biến 3 mặt: Mặt trước, mặt trong, mặt sau',
        'packaging', 'Kèm 1 phong bì giấy kraft thủ công'
      ),
      'capabilities', jsonb_build_array(
        'Thiết kế cả 3 mặt (trước, trong, sau)',
        'Tặng kèm phong bì kraft vintage',
        'Giấy mỹ thuật gân kem chống lem mực'
      )
    )
  ),
  (
    'wrapping',
    'wrapping-paper',
    'Giấy gói quà',
    'wrapping',
    true,
    jsonb_build_object(
      'englishName', 'Wrapping Paper',
      'cardTitle', 'Giấy gói quà',
      'tagline', 'Gói ghém yêu thương trong từng nếp gấp',
      'description', 'Giấy mỹ thuật chất lượng cao in sắc nét, hoàn hảo cho hộp quà sinh nhật, ngày lễ và kỷ niệm.',
      'startingPrice', 49000,
      'paperSpecs', jsonb_build_object(
        'paperType', 'Giấy ford mịn 100gsm & kraft mộc mạc',
        'printSurfaces', 'In tràn viền 1 mặt sắc nét',
        'packaging', 'Đóng gói cuộn chống gãy nếp'
      ),
      'capabilities', jsonb_build_array(
        'In họa tiết lặp (Repeat Pattern)',
        'In toàn khổ ảnh đơn (Full-Sheet)',
        'Chất giấy dai, bắt mực mịn màng'
      )
    )
  ),
  (
    'sticker',
    'sticker',
    'Sticker dán theo yêu cầu',
    'sticker',
    true,
    jsonb_build_object(
      'englishName', 'Custom Sticker',
      'cardTitle', 'Sticker',
      'tagline', 'Nhãn dán sắc nét, bền bỉ chống thấm nước',
      'description', 'In decal vinyl cao cấp phủ màng chống trầy xước, dán chắc chắn trên ốp lưng, laptop, bình nước.',
      'startingPrice', 19000,
      'paperSpecs', jsonb_build_object(
        'paperType', 'Decal Vinyl phủ màng laminate chống nước',
        'printSurfaces', 'Hệ màu in CMYK chuẩn xác',
        'packaging', 'Cắt bế viền chuẩn xác từng chiếc'
      ),
      'capabilities', jsonb_build_array(
        'Chống nước, chống tia UV không bay màu',
        'Tùy chỉnh độ dày viền trắng bảo vệ',
        'Bóc dán dễ dàng, không để lại keo dính'
      )
    )
  ),
  (
    'notebook',
    'notebook-cover',
    'Bìa sổ tay cá nhân hóa',
    'notebook',
    true,
    jsonb_build_object(
      'englishName', 'Notebook Cover',
      'cardTitle', 'Bìa vở',
      'tagline', 'Ghi chép hành trình mang đậm dấu ấn riêng',
      'description', 'Bìa cứng ivory 350gsm bồi chắc chắn, bo góc chuẩn mực, cán màng bảo vệ giúp sổ luôn bền đẹp.',
      'startingPrice', 49000,
      'paperSpecs', jsonb_build_object(
        'paperType', 'Giấy Ivory 350gsm bồi cứng, bo tròn 4 góc',
        'printSurfaces', 'In tràn bìa trước và gáy sổ',
        'packaging', 'Bọc màng co bảo vệ chống trầy'
      ),
      'capabilities', jsonb_build_array(
        'Cán màng mờ (Matte) hoặc bóng (Glossy)',
        'Bìa cứng cáp chống quăn mép',
        'Chuẩn kích thước sổ còng & sổ chỉ A5'
      )
    )
  )
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  product_type = excluded.product_type,
  active = excluded.active,
  metadata = excluded.metadata,
  updated_at = now();

-- 2. Product Variants
insert into public.product_variants (id, product_id, name, price, metadata, active)
values
  -- Wrapping variants
  ('a1', 'wrapping', 'Khổ A1', 69000, jsonb_build_object('dimensions', '90 × 60 cm', 'bestFor', 'Hộp quà vừa & lớn'), true),
  ('a2', 'wrapping', 'Khổ A2', 49000, jsonb_build_object('dimensions', '60 × 45 cm', 'bestFor', 'Hộp quà nhỏ & tập sách'), true),
  -- Card variants
  ('horizontal', 'card', 'Thiệp ngang', 29000, jsonb_build_object('dimensions', '15 × 10 cm (gập)', 'bestFor', 'Ảnh phong cảnh & lời chúc dài'), true),
  ('vertical', 'card', 'Thiệp đứng', 29000, jsonb_build_object('dimensions', '10 × 15 cm (gập)', 'bestFor', 'Ảnh chân dung & hoa văn trang nhã'), true),
  -- Sticker variants
  ('die-cut', 'sticker', 'Cắt theo hình (Die-cut)', 19000, jsonb_build_object('dimensions', '5 - 7 cm theo đường nét', 'bestFor', 'Logo, linh vật & doodle'), true),
  ('fixed-shape', 'sticker', 'Hình cố định (Tròn/Vuông)', 19000, jsonb_build_object('dimensions', '5 × 5 cm chuẩn form', 'bestFor', 'Nhãn hộp quà, tem niêm phong'), true),
  ('phone', 'sticker', 'Sticker dán ốp điện thoại', 25000, jsonb_build_object('dimensions', 'Vừa mặt lưng điện thoại', 'bestFor', 'Trang trí ốp lưng smartphone'), true),
  -- Notebook variants
  ('standard', 'notebook', 'Khổ A5 tiêu chuẩn', 49000, jsonb_build_object('dimensions', '14.8 × 21 cm', 'bestFor', 'Sổ tay, bullet journal & sketch'), true)
on conflict (id) do update set
  product_id = excluded.product_id,
  name = excluded.name,
  price = excluded.price,
  metadata = excluded.metadata,
  active = excluded.active,
  updated_at = now();

-- 3. Templates & Template Versions
insert into public.templates (id, product_id, slug, name, published, thumbnail_path, metadata)
values
  ('blank', null, 'blank', 'Trống', true, null, jsonb_build_object('category', 'minimal', 'previewHint', 'Bắt đầu từ trang trắng')),
  ('minimal', null, 'minimal', 'Tối giản', true, null, jsonb_build_object('category', 'minimal', 'previewHint', 'Đường nét thanh lịch, gam màu trung tính')),
  ('celebrate', null, 'celebrate', 'Tiệc tùng', true, null, jsonb_build_object('category', 'birthday', 'previewHint', 'Rực rỡ cho các dịp sinh nhật và kỷ niệm')),
  ('card-h-birthday', 'card', 'card-h-birthday', 'Sinh nhật ấm áp', true, null, jsonb_build_object('category', 'birthday', 'variantIds', jsonb_build_array('horizontal'))),
  ('card-h-cute', 'card', 'card-h-cute', 'Gấu con đáng yêu', true, null, jsonb_build_object('category', 'cute', 'variantIds', jsonb_build_array('horizontal'))),
  ('card-h-love', 'card', 'card-h-love', 'Tình yêu dịu êm', true, null, jsonb_build_object('category', 'love', 'variantIds', jsonb_build_array('horizontal'))),
  ('card-v-floral', 'card', 'card-v-floral', 'Nhành hoa nhỏ', true, null, jsonb_build_object('category', 'floral', 'variantIds', jsonb_build_array('vertical'))),
  ('card-thanks', 'card', 'card-thanks', 'Lời cảm ơn', true, null, jsonb_build_object('category', 'thanks')),
  ('wrapping-a1-cute', 'wrapping', 'wrapping-a1-cute', 'Họa tiết Cute A1', true, null, jsonb_build_object('category', 'cute', 'variantIds', jsonb_build_array('a1'))),
  ('wrapping-a1-floral', 'wrapping', 'wrapping-a1-floral', 'Vườn hoa Pastel A1', true, null, jsonb_build_object('category', 'floral', 'variantIds', jsonb_build_array('a1'))),
  ('wrapping-a2-minimal', 'wrapping', 'wrapping-a2-minimal', 'Kẻ sọc Minimal A2', true, null, jsonb_build_object('category', 'minimal', 'variantIds', jsonb_build_array('a2'))),
  ('wrapping-birthday-balloons', 'wrapping', 'wrapping-birthday-balloons', 'Bóng bay Sinh nhật', true, null, jsonb_build_object('category', 'birthday')),
  ('sticker-diecut-love', 'sticker', 'sticker-diecut-love', 'Trái tim viền trắng', true, null, jsonb_build_object('category', 'love', 'variantIds', jsonb_build_array('die-cut'))),
  ('sticker-cute-pack', 'sticker', 'sticker-cute-pack', 'Sticker Mèo con', true, null, jsonb_build_object('category', 'cute')),
  ('sticker-cozy-coffee', 'sticker', 'sticker-cozy-coffee', 'Tách cà phê Ấm', true, null, jsonb_build_object('category', 'minimal', 'variantIds', jsonb_build_array('fixed-shape', 'die-cut'))),
  ('notebook-floral', 'notebook', 'notebook-floral', 'Khu vườn bí mật', true, null, jsonb_build_object('category', 'floral')),
  ('notebook-minimal', 'notebook', 'notebook-minimal', 'Ghi chú Tối giản', true, null, jsonb_build_object('category', 'minimal'))
on conflict (id) do update set
  product_id = excluded.product_id,
  slug = excluded.slug,
  name = excluded.name,
  published = excluded.published,
  thumbnail_path = excluded.thumbnail_path,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.template_versions (template_id, version, design_document)
values
  (
    'blank',
    1,
    jsonb_build_object(
      'text', '',
      'color', '#111827',
      'backgroundColor', '#ffffff',
      'elements', '[]'::jsonb,
      'productOptions', '{}'::jsonb
    )
  ),
  (
    'minimal',
    1,
    jsonb_build_object(
      'text', 'Dành riêng cho bạn',
      'color', '#243447',
      'backgroundColor', '#f5f1e8',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'wrapping', jsonb_build_object(
          'mode', 'full-sheet',
          'patternConfig', jsonb_build_object(
            'enabled', false,
            'repeatMode', 'basic',
            'scale', 90,
            'spacingX', 0,
            'spacingY', 0,
            'rotation', 0,
            'backgroundColor', '#f5f1e8'
          ),
          'repeatStyle', 'regular',
          'patternScale', 90
        ),
        'card', jsonb_build_object('surface', 'front', 'fold', 'half'),
        'sticker', jsonb_build_object('hasWhiteBorder', true, 'borderWidth', 6),
        'notebook', jsonb_build_object('finish', 'matte')
      )
    )
  ),
  (
    'celebrate',
    1,
    jsonb_build_object(
      'text', 'Chúc mừng!',
      'color', '#7c2d12',
      'backgroundColor', '#fef3c7',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'wrapping', jsonb_build_object(
          'mode', 'pattern',
          'patternConfig', jsonb_build_object(
            'enabled', true,
            'repeatMode', 'half-brick',
            'scale', 125,
            'spacingX', 0,
            'spacingY', 0,
            'rotation', 0,
            'backgroundColor', '#ffffff'
          ),
          'repeatStyle', 'brick',
          'patternScale', 125
        ),
        'card', jsonb_build_object('surface', 'inside', 'fold', 'half'),
        'sticker', jsonb_build_object('hasWhiteBorder', true, 'borderWidth', 10),
        'notebook', jsonb_build_object('finish', 'glossy')
      )
    )
  ),
  (
    'card-h-birthday',
    1,
    jsonb_build_object(
      'text', 'Happy Birthday to You',
      'color', '#B86C84',
      'backgroundColor', '#FFFDF8',
      'productOptions', jsonb_build_object('card', jsonb_build_object('surface', 'front', 'fold', 'half')),
      'elements', jsonb_build_array(
        jsonb_build_object(
          'id', 'card-h-birthday-front-text',
          'type', 'text',
          'name', 'Happy Birthday to You',
          'x', 50,
          'y', 50,
          'width', 70,
          'height', 16,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'front',
          'data', jsonb_build_object(
            'text', 'Happy Birthday to You',
            'color', '#B86C84',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 28,
            'fontWeight', 'bold',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.2,
            'letterSpacing', 0,
            'placeholder', false
          )
        ),
        jsonb_build_object(
          'id', 'card-h-birthday-inside-text',
          'type', 'text',
          'name', 'Chúc bạn một tuổi mới ngập tràn',
          'x', 50,
          'y', 50,
          'width', 70,
          'height', 14,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'inside',
          'data', jsonb_build_object(
            'text', 'Chúc bạn một tuổi mới ngập tràn niềm vui và hạnh phúc!',
            'color', '#2E3338',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 20,
            'fontWeight', 'regular',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.4,
            'letterSpacing', 0,
            'placeholder', false
          )
        )
      )
    )
  ),
  (
    'card-h-cute',
    1,
    jsonb_build_object(
      'text', 'You are so special!',
      'color', '#315F86',
      'backgroundColor', '#F8F3E8',
      'productOptions', jsonb_build_object('card', jsonb_build_object('surface', 'front', 'fold', 'half')),
      'elements', jsonb_build_array(
        jsonb_build_object(
          'id', 'card-h-cute-front-text',
          'type', 'text',
          'name', 'You are so special!',
          'x', 50,
          'y', 45,
          'width', 70,
          'height', 16,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'front',
          'data', jsonb_build_object(
            'text', 'You are so special!',
            'color', '#315F86',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 28,
            'fontWeight', 'bold',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.2,
            'letterSpacing', 0,
            'placeholder', false
          )
        ),
        jsonb_build_object(
          'id', 'card-h-cute-inside-text',
          'type', 'text',
          'name', 'Gửi đến bạn những cái ôm ấm áp',
          'x', 50,
          'y', 50,
          'width', 70,
          'height', 14,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'inside',
          'data', jsonb_build_object(
            'text', 'Gửi đến bạn những cái ôm ấm áp nhất hôm nay.',
            'color', '#2E3338',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 20,
            'fontWeight', 'regular',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.4,
            'letterSpacing', 0,
            'placeholder', false
          )
        )
      )
    )
  ),
  (
    'card-h-love',
    1,
    jsonb_build_object(
      'text', 'Forever & Always',
      'color', '#B3535D',
      'backgroundColor', '#FFF8F8',
      'productOptions', jsonb_build_object('card', jsonb_build_object('surface', 'front', 'fold', 'half')),
      'elements', jsonb_build_array(
        jsonb_build_object(
          'id', 'card-h-love-front-text',
          'type', 'text',
          'name', 'Forever & Always',
          'x', 50,
          'y', 48,
          'width', 70,
          'height', 16,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'front',
          'data', jsonb_build_object(
            'text', 'Forever & Always',
            'color', '#B3535D',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 28,
            'fontWeight', 'bold',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.2,
            'letterSpacing', 0,
            'placeholder', false
          )
        ),
        jsonb_build_object(
          'id', 'card-h-love-inside-text',
          'type', 'text',
          'name', 'Cảm ơn vì đã luôn đồng hành và',
          'x', 50,
          'y', 50,
          'width', 70,
          'height', 14,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'inside',
          'data', jsonb_build_object(
            'text', 'Cảm ơn vì đã luôn đồng hành và yêu thương.',
            'color', '#2E3338',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 20,
            'fontWeight', 'regular',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.4,
            'letterSpacing', 0,
            'placeholder', false
          )
        )
      )
    )
  ),
  (
    'card-v-floral',
    1,
    jsonb_build_object(
      'text', 'Lời chúc yêu thương',
      'color', '#2E3338',
      'backgroundColor', '#FAF7F0',
      'productOptions', jsonb_build_object('card', jsonb_build_object('surface', 'front', 'fold', 'half')),
      'elements', jsonb_build_array(
        jsonb_build_object(
          'id', 'card-v-floral-front-text',
          'type', 'text',
          'name', 'Lời chúc yêu thương',
          'x', 50,
          'y', 42,
          'width', 70,
          'height', 16,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'front',
          'data', jsonb_build_object(
            'text', 'Lời chúc yêu thương',
            'color', '#2E3338',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 28,
            'fontWeight', 'bold',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.2,
            'letterSpacing', 0,
            'placeholder', false
          )
        ),
        jsonb_build_object(
          'id', 'card-v-floral-inside-text',
          'type', 'text',
          'name', 'Mong mỗi ngày của bạn đều dịu d',
          'x', 50,
          'y', 50,
          'width', 70,
          'height', 14,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'inside',
          'data', jsonb_build_object(
            'text', 'Mong mỗi ngày của bạn đều dịu dàng như hoa nở.',
            'color', '#2E3338',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 20,
            'fontWeight', 'regular',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.4,
            'letterSpacing', 0,
            'placeholder', false
          )
        )
      )
    )
  ),
  (
    'card-thanks',
    1,
    jsonb_build_object(
      'text', 'Thank you so much',
      'color', '#5F7E67',
      'backgroundColor', '#F3F6F3',
      'productOptions', jsonb_build_object('card', jsonb_build_object('surface', 'front', 'fold', 'half')),
      'elements', jsonb_build_array(
        jsonb_build_object(
          'id', 'card-thanks-front-text',
          'type', 'text',
          'name', 'Thank you so much',
          'x', 50,
          'y', 45,
          'width', 70,
          'height', 16,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'front',
          'data', jsonb_build_object(
            'text', 'Thank you so much',
            'color', '#5F7E67',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 28,
            'fontWeight', 'bold',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.2,
            'letterSpacing', 0,
            'placeholder', false
          )
        ),
        jsonb_build_object(
          'id', 'card-thanks-inside-text',
          'type', 'text',
          'name', 'Biết ơn tất cả sự giúp đỡ và qu',
          'x', 50,
          'y', 50,
          'width', 70,
          'height', 14,
          'rotation', 0,
          'locked', false,
          'zIndex', 1,
          'surface', 'inside',
          'data', jsonb_build_object(
            'text', 'Biết ơn tất cả sự giúp đỡ và quan tâm từ bạn.',
            'color', '#2E3338',
            'fontFamily', 'Be Vietnam Pro',
            'fontSize', 20,
            'fontWeight', 'regular',
            'fontStyle', 'normal',
            'align', 'center',
            'lineHeight', 1.4,
            'letterSpacing', 0,
            'placeholder', false
          )
        )
      )
    )
  ),
  (
    'wrapping-a1-cute',
    1,
    jsonb_build_object(
      'text', 'Sweet Gift',
      'color', '#315F86',
      'backgroundColor', '#F4EAE1',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'wrapping', jsonb_build_object(
          'mode', 'pattern',
          'patternConfig', jsonb_build_object(
            'enabled', true,
            'repeatMode', 'half-drop',
            'scale', 110,
            'spacingX', 0,
            'spacingY', 0,
            'rotation', 0,
            'backgroundColor', '#ffffff'
          ),
          'repeatStyle', 'half-drop',
          'patternScale', 110
        )
      )
    )
  ),
  (
    'wrapping-a1-floral',
    1,
    jsonb_build_object(
      'text', 'For You',
      'color', '#7c2d12',
      'backgroundColor', '#F9F4EE',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'wrapping', jsonb_build_object(
          'mode', 'pattern',
          'patternConfig', jsonb_build_object(
            'enabled', true,
            'repeatMode', 'half-brick',
            'scale', 130,
            'spacingX', 0,
            'spacingY', 0,
            'rotation', 0,
            'backgroundColor', '#ffffff'
          ),
          'repeatStyle', 'brick',
          'patternScale', 130
        )
      )
    )
  ),
  (
    'wrapping-a2-minimal',
    1,
    jsonb_build_object(
      'text', 'Simple Joy',
      'color', '#2E3338',
      'backgroundColor', '#EFECE6',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'wrapping', jsonb_build_object(
          'mode', 'pattern',
          'patternConfig', jsonb_build_object(
            'enabled', true,
            'repeatMode', 'basic',
            'scale', 85,
            'spacingX', 0,
            'spacingY', 0,
            'rotation', 0,
            'backgroundColor', '#ffffff'
          ),
          'repeatStyle', 'regular',
          'patternScale', 85
        )
      )
    )
  ),
  (
    'wrapping-birthday-balloons',
    1,
    jsonb_build_object(
      'text', 'Happy Birthday',
      'color', '#8C3B2F',
      'backgroundColor', '#FFF2EB',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'wrapping', jsonb_build_object(
          'mode', 'pattern',
          'patternConfig', jsonb_build_object(
            'enabled', true,
            'repeatMode', 'half-brick',
            'scale', 110,
            'spacingX', 0,
            'spacingY', 0,
            'rotation', 0,
            'backgroundColor', '#ffffff'
          ),
          'repeatStyle', 'brick',
          'patternScale', 110
        )
      )
    )
  ),
  (
    'sticker-diecut-love',
    1,
    jsonb_build_object(
      'text', 'Love',
      'color', '#B3535D',
      'backgroundColor', '#FFFFFF',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'sticker', jsonb_build_object(
          'hasWhiteBorder', true,
          'borderWidth', 8,
          'cutLineMode', 'die-cut'
        )
      )
    )
  ),
  (
    'sticker-cute-pack',
    1,
    jsonb_build_object(
      'text', 'Meow',
      'color', '#2E3338',
      'backgroundColor', '#FFFFFF',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'sticker', jsonb_build_object(
          'shape', 'circle',
          'hasWhiteBorder', true,
          'borderWidth', 6
        )
      )
    )
  ),
  (
    'sticker-cozy-coffee',
    1,
    jsonb_build_object(
      'text', 'Warm Coffee & Book',
      'color', '#5C381E',
      'backgroundColor', '#FDF7EE',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object(
        'sticker', jsonb_build_object(
          'shape', 'rounded-rectangle',
          'hasWhiteBorder', true,
          'borderWidth', 5
        )
      )
    )
  ),
  (
    'notebook-floral',
    1,
    jsonb_build_object(
      'text', 'My Daily Journal',
      'color', '#2E3338',
      'backgroundColor', '#EDE8DF',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object('notebook', jsonb_build_object('finish', 'matte'))
    )
  ),
  (
    'notebook-minimal',
    1,
    jsonb_build_object(
      'text', 'Thoughts & Ideas',
      'color', '#344E66',
      'backgroundColor', '#F3F5F7',
      'elements', '[]'::jsonb,
      'productOptions', jsonb_build_object('notebook', jsonb_build_object('finish', 'matte'))
    )
  )
on conflict (template_id, version) do update set
  design_document = excluded.design_document;

-- 4. Fonts (authoritative matching src/lib/fonts.ts)
insert into public.fonts (id, family_name, google_font, storage_path, published, metadata)
values
  ('be-vietnam-pro', 'Be Vietnam Pro', 'Be+Vietnam+Pro:wght@400;600;700', null, true, jsonb_build_object('category', 'sans', 'family', '"Be Vietnam Pro", system-ui, sans-serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('lora', 'Lora', 'Lora:wght@500;600;700', null, true, jsonb_build_object('category', 'serif', 'family', 'Lora, Georgia, serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('playfair-display', 'Playfair Display', 'Playfair+Display:wght@600;700', null, true, jsonb_build_object('category', 'display', 'family', '"Playfair Display", serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('montserrat', 'Montserrat', 'Montserrat:wght@500;700', null, true, jsonb_build_object('category', 'sans', 'family', 'Montserrat, sans-serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('merriweather', 'Merriweather', 'Merriweather:wght@400;700', null, true, jsonb_build_object('category', 'serif', 'family', 'Merriweather, serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('comfortaa', 'Comfortaa', 'Comfortaa:wght@600;700', null, true, jsonb_build_object('category', 'display', 'family', 'Comfortaa, cursive', 'sampleText', 'Cảm ơn Việt Nam')),
  ('dancing-script', 'Dancing Script', 'Dancing+Script:wght@600;700', null, true, jsonb_build_object('category', 'handwriting', 'family', '"Dancing Script", cursive', 'sampleText', 'Cảm ơn Việt Nam')),
  ('quicksand', 'Quicksand', 'Quicksand:wght@500;700', null, true, jsonb_build_object('category', 'sans', 'family', 'Quicksand, sans-serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('pacifico', 'Pacifico', 'Pacifico', null, true, jsonb_build_object('category', 'handwriting', 'family', 'Pacifico, cursive', 'sampleText', 'Cảm ơn Việt Nam')),
  ('caveat', 'Caveat', 'Caveat:wght@600;700', null, true, jsonb_build_object('category', 'handwriting', 'family', 'Caveat, cursive', 'sampleText', 'Cảm ơn Việt Nam')),
  ('roboto', 'Roboto', 'Roboto:wght@400;700', null, true, jsonb_build_object('category', 'sans', 'family', 'Roboto, sans-serif', 'sampleText', 'Cảm ơn Việt Nam')),
  ('old-typewriter', 'Old Typewriter', null, null, false, jsonb_build_object('category', 'display', 'family', '"Courier New", monospace', 'status', 'archived', 'sampleText', 'Cảm ơn Việt Nam')),
  ('future-display', 'Future Display Draft', null, null, false, jsonb_build_object('category', 'display', 'family', 'sans-serif', 'status', 'draft', 'sampleText', 'Cảm ơn Việt Nam'))
on conflict (id) do update set
  family_name = excluded.family_name,
  google_font = excluded.google_font,
  storage_path = excluded.storage_path,
  published = excluded.published,
  metadata = excluded.metadata,
  updated_at = now();

-- 5. Deterministic Projects & Design Versions for Inbox Testing
insert into public.projects (id, owner_user_id, guest_key_hash, product_id, variant_id, status, current_working_revision)
values
  ('00000000-0000-4000-8000-000000000001', null, null, 'card', 'horizontal', 'approved', 1),
  ('00000000-0000-4000-8000-000000000002', null, null, 'wrapping', 'a2', 'editing', 1),
  ('00000000-0000-4000-8000-000000000003', null, null, 'sticker', 'die-cut', 'ready', 1),
  ('00000000-0000-4000-8000-000000000004', null, null, 'notebook', 'standard', 'ready', 1)
on conflict (id) do update set
  product_id = excluded.product_id,
  variant_id = excluded.variant_id,
  status = excluded.status,
  updated_at = now();

insert into public.design_versions (id, project_id, version_number, source, design_document, product_snapshot, preflight_snapshot)
values
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    1,
    'template:card-h-birthday',
    jsonb_build_object('text', 'Happy Birthday to You', 'color', '#B86C84', 'backgroundColor', '#FFFDF8'),
    jsonb_build_object('productId', 'card', 'variantId', 'horizontal'),
    jsonb_build_object('hasErrors', false, 'hasWarnings', false)
  ),
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000002',
    1,
    'customizer',
    jsonb_build_object('text', 'Sweet Gift', 'color', '#315F86', 'backgroundColor', '#F4EAE1'),
    jsonb_build_object('productId', 'wrapping', 'variantId', 'a2'),
    jsonb_build_object('hasErrors', false, 'hasWarnings', false)
  ),
  (
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000003',
    1,
    'customizer',
    jsonb_build_object('text', 'Love', 'color', '#B3535D', 'backgroundColor', '#FFFFFF'),
    jsonb_build_object('productId', 'sticker', 'variantId', 'die-cut'),
    jsonb_build_object('hasErrors', false, 'hasWarnings', false)
  ),
  (
    '00000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000004',
    1,
    'template:notebook-floral',
    jsonb_build_object('text', 'My Daily Journal', 'color', '#2E3338', 'backgroundColor', '#EDE8DF'),
    jsonb_build_object('productId', 'notebook', 'variantId', 'standard'),
    jsonb_build_object('hasErrors', false, 'hasWarnings', false)
  )
on conflict (project_id, version_number) do update set
  source = excluded.source,
  design_document = excluded.design_document,
  product_snapshot = excluded.product_snapshot,
  preflight_snapshot = excluded.preflight_snapshot;

-- 6. Deterministic Orders for Inbox Testing
insert into public.orders (
  id,
  public_order_code,
  project_id,
  approved_design_version_id,
  product_snapshot,
  variant_snapshot,
  quantity,
  unit_price,
  subtotal,
  total,
  currency,
  customer_full_name,
  customer_phone,
  customer_phone_normalized,
  shipping_address,
  payment_status,
  design_status,
  fulfillment_status,
  idempotency_key
)
values
  (
    'e0000000-0000-4000-8000-000000000001',
    'QT2609300001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011',
    jsonb_build_object('id', 'card', 'name', 'Thiệp chúc mừng'),
    jsonb_build_object('id', 'horizontal', 'name', 'Thiệp ngang', 'price', 29000),
    10,
    29000,
    290000,
    290000,
    'VND',
    'Nguyễn Văn An',
    '0901234567',
    '+84901234567',
    '123 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    'paid',
    'approved',
    'ready_for_production',
    'seed-order-1'
  ),
  (
    'e0000000-0000-4000-8000-000000000002',
    'QT2609300002',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000021',
    jsonb_build_object('id', 'wrapping', 'name', 'Giấy gói quà'),
    jsonb_build_object('id', 'a2', 'name', 'Khổ A2', 'price', 49000),
    5,
    49000,
    245000,
    245000,
    'VND',
    'Trần Thị Bình',
    '0912345678',
    '+84912345678',
    '456 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    'pending_payment',
    'awaiting_review',
    'unprocessed',
    'seed-order-2'
  ),
  (
    'e0000000-0000-4000-8000-000000000003',
    'QT2609300003',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000031',
    jsonb_build_object('id', 'sticker', 'name', 'Sticker dán theo yêu cầu'),
    jsonb_build_object('id', 'die-cut', 'name', 'Cắt theo hình (Die-cut)', 'price', 19000),
    20,
    19000,
    380000,
    380000,
    'VND',
    'Lê Hoàng Cường',
    '0987654321',
    '+84987654321',
    '789 Hoàng Hoa Thám, Ba Đình, Hà Nội',
    'payment_reported',
    'editing',
    'unprocessed',
    'seed-order-3'
  ),
  (
    'e0000000-0000-4000-8000-000000000004',
    'QT2609300004',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000041',
    jsonb_build_object('id', 'notebook', 'name', 'Bìa sổ tay cá nhân hóa'),
    jsonb_build_object('id', 'standard', 'name', 'Khổ A5 tiêu chuẩn', 'price', 49000),
    2,
    49000,
    98000,
    98000,
    'VND',
    'Phạm Mai Dung',
    '0934567890',
    '+84934567890',
    '12 Trần Phú, Hải Châu, Đà Nẵng',
    'paid',
    'ready',
    'in_production',
    'seed-order-4'
  )
on conflict (id) do update set
  public_order_code = excluded.public_order_code,
  project_id = excluded.project_id,
  approved_design_version_id = excluded.approved_design_version_id,
  product_snapshot = excluded.product_snapshot,
  variant_snapshot = excluded.variant_snapshot,
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  subtotal = excluded.subtotal,
  total = excluded.total,
  customer_full_name = excluded.customer_full_name,
  customer_phone = excluded.customer_phone,
  customer_phone_normalized = excluded.customer_phone_normalized,
  shipping_address = excluded.shipping_address,
  payment_status = excluded.payment_status,
  design_status = excluded.design_status,
  fulfillment_status = excluded.fulfillment_status,
  updated_at = now();

-- 7. Order Payments for Deterministic Orders
insert into public.order_payments (order_id, provider, amount, currency, reference, status, confirmed_at, customer_reported_at)
values
  ('e0000000-0000-4000-8000-000000000001', 'vietqr', 290000, 'VND', 'VQR-QT0001', 'paid', now(), now()),
  ('e0000000-0000-4000-8000-000000000002', 'vietqr', 245000, 'VND', 'VQR-QT0002', 'pending_payment', null, null),
  ('e0000000-0000-4000-8000-000000000003', 'bank_transfer', 380000, 'VND', 'BT-QT0003', 'payment_reported', null, now()),
  ('e0000000-0000-4000-8000-000000000004', 'vietqr', 98000, 'VND', 'VQR-QT0004', 'paid', now(), now())
on conflict (order_id) do update set
  provider = excluded.provider,
  amount = excluded.amount,
  reference = excluded.reference,
  status = excluded.status,
  confirmed_at = excluded.confirmed_at,
  customer_reported_at = excluded.customer_reported_at,
  updated_at = now();

-- 8. Order Events
insert into public.order_events (order_id, event_type, actor_role, payload)
values
  ('e0000000-0000-4000-8000-000000000001', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000000001', 'payment_confirmed', 'system', jsonb_build_object('provider', 'vietqr', 'amount', 290000)),
  ('e0000000-0000-4000-8000-000000000001', 'design_approved', 'staff', jsonb_build_object('note', 'Design verified for print')),

  ('e0000000-0000-4000-8000-000000000002', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),

  ('e0000000-0000-4000-8000-000000000003', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000000003', 'payment_reported', 'customer', jsonb_build_object('ref', 'BT-QT0003')),

  ('e0000000-0000-4000-8000-000000000004', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000000004', 'payment_confirmed', 'system', jsonb_build_object('provider', 'vietqr', 'amount', 98000)),
  ('e0000000-0000-4000-8000-000000000004', 'production_started', 'staff', jsonb_build_object('batch', 'batch-2026-09-30-01'));

-- 9. State 38 Operational Order Scenarios (QT3801 - QT3807)
-- Projects
insert into public.projects (id, product_id, variant_id, status, current_working_revision)
values
  ('00000000-0000-4000-8000-000000003801', 'sticker', 'die-cut', 'approved', 1),
  ('00000000-0000-4000-8000-000000003802', 'card', 'horizontal', 'approved', 1),
  ('00000000-0000-4000-8000-000000003803', 'wrapping', 'a2', 'approved', 1),
  ('00000000-0000-4000-8000-000000003804', 'notebook', 'standard', 'approved', 1),
  ('00000000-0000-4000-8000-000000003805', 'card', 'horizontal', 'approved', 1),
  ('00000000-0000-4000-8000-000000003806', 'sticker', 'die-cut', 'approved', 1),
  ('00000000-0000-4000-8000-000000003807', 'notebook', 'standard', 'approved', 1)
on conflict (id) do nothing;

-- Design Versions
insert into public.design_versions (
  id,
  project_id,
  version_number,
  source,
  design_document,
  product_snapshot,
  preflight_snapshot,
  approved_thumbnail_path
)
values
  (
    '00000000-0000-4000-8000-000000003811',
    '00000000-0000-4000-8000-000000003801',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Sticker QT3801', 'color', '#000000'),
    jsonb_build_object('productId', 'sticker', 'variantId', 'die-cut'),
    jsonb_build_object('level', 'pass', 'passCount', 5, 'warningCount', 0, 'errorCount', 0, 'acceptedWarningCount', 0, 'checks', '[]'::jsonb),
    'approved-renders/preview-3801.png'
  ),
  (
    '00000000-0000-4000-8000-000000003812',
    '00000000-0000-4000-8000-000000003802',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Thiệp QT3802', 'color', '#B3535D'),
    jsonb_build_object('productId', 'card', 'variantId', 'horizontal'),
    jsonb_build_object('level', 'warning', 'passCount', 4, 'warningCount', 1, 'errorCount', 0, 'acceptedWarningCount', 1, 'checks', jsonb_build_array(jsonb_build_object('id', 'safe-area', 'level', 'warning', 'category', 'safe-area', 'label', 'Chữ nằm sát mép cắt', 'description', 'Nội dung cách mép cắt dưới 3mm', 'advice', 'Nên lùi chữ vào trong vùng an toàn'))),
    'approved-renders/preview-3802.png'
  ),
  (
    '00000000-0000-4000-8000-000000003813',
    '00000000-0000-4000-8000-000000003803',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Giấy gói QT3803', 'color', '#1E40AF'),
    jsonb_build_object('productId', 'wrapping', 'variantId', 'a2'),
    jsonb_build_object('level', 'pass', 'passCount', 5, 'warningCount', 0, 'errorCount', 0, 'acceptedWarningCount', 0, 'checks', '[]'::jsonb),
    'approved-renders/preview-3803.png'
  ),
  (
    '00000000-0000-4000-8000-000000003814',
    '00000000-0000-4000-8000-000000003804',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Bìa sổ QT3804', 'color', '#334155'),
    jsonb_build_object('productId', 'notebook', 'variantId', 'standard'),
    jsonb_build_object('level', 'pass', 'passCount', 5, 'warningCount', 0, 'errorCount', 0, 'acceptedWarningCount', 0, 'checks', '[]'::jsonb),
    'approved-renders/preview-3804.png'
  ),
  (
    '00000000-0000-4000-8000-000000003815',
    '00000000-0000-4000-8000-000000003805',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Thiệp QT3805 Hold', 'color', '#B3535D'),
    jsonb_build_object('productId', 'card', 'variantId', 'horizontal'),
    jsonb_build_object('level', 'pass', 'passCount', 5, 'warningCount', 0, 'errorCount', 0, 'acceptedWarningCount', 0, 'checks', '[]'::jsonb),
    'approved-renders/preview-3805.png'
  ),
  (
    '00000000-0000-4000-8000-000000003816',
    '00000000-0000-4000-8000-000000003806',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Sticker QT3806', 'color', '#000000'),
    jsonb_build_object('productId', 'sticker', 'variantId', 'die-cut'),
    jsonb_build_object('level', 'pass', 'passCount', 5, 'warningCount', 0, 'errorCount', 0, 'acceptedWarningCount', 0, 'checks', '[]'::jsonb),
    'approved-renders/preview-3806.png'
  ),
  (
    '00000000-0000-4000-8000-000000003817',
    '00000000-0000-4000-8000-000000003807',
    1,
    'customer_approved',
    jsonb_build_object('text', 'Bìa sổ QT3807', 'color', '#10B981'),
    jsonb_build_object('productId', 'notebook', 'variantId', 'standard'),
    jsonb_build_object('level', 'pass', 'passCount', 5, 'warningCount', 0, 'errorCount', 0, 'acceptedWarningCount', 0, 'checks', '[]'::jsonb),
    'approved-renders/preview-3807.png'
  )
on conflict (project_id, version_number) do update set
  approved_thumbnail_path = excluded.approved_thumbnail_path,
  preflight_snapshot = excluded.preflight_snapshot;

-- Orders
insert into public.orders (
  id,
  public_order_code,
  project_id,
  approved_design_version_id,
  product_snapshot,
  variant_snapshot,
  quantity,
  unit_price,
  subtotal,
  total,
  currency,
  customer_full_name,
  customer_phone,
  customer_phone_normalized,
  shipping_address,
  payment_status,
  design_status,
  fulfillment_status,
  idempotency_key
)
values
  (
    'e0000000-0000-4000-8000-000000003801',
    'QT3801',
    '00000000-0000-4000-8000-000000003801',
    '00000000-0000-4000-8000-000000003811',
    jsonb_build_object('id', 'sticker', 'name', 'Sticker dán theo yêu cầu'),
    jsonb_build_object('id', 'die-cut', 'name', 'Cắt theo hình (Die-cut)', 'price', 19000),
    10,
    19000,
    190000,
    190000,
    'VND',
    'Trần Minh Anh',
    '0908111222',
    '+84908111222',
    '12 Tôn Đức Thắng, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    'pending_payment',
    'awaiting_review',
    'unprocessed',
    'seed-order-3801'
  ),
  (
    'e0000000-0000-4000-8000-000000003802',
    'QT3802',
    '00000000-0000-4000-8000-000000003802',
    '00000000-0000-4000-8000-000000003812',
    jsonb_build_object('id', 'card', 'name', 'Thiệp chúc mừng'),
    jsonb_build_object('id', 'horizontal', 'name', 'Thiệp ngang', 'price', 29000),
    10,
    29000,
    290000,
    290000,
    'VND',
    'Lê Thu Trang',
    '0908222333',
    '+84908222333',
    '34 Hai Bà Trưng, Phường 6, Quận 3, TP. Hồ Chí Minh',
    'payment_reported',
    'awaiting_review',
    'unprocessed',
    'seed-order-3802'
  ),
  (
    'e0000000-0000-4000-8000-000000003803',
    'QT3803',
    '00000000-0000-4000-8000-000000003803',
    '00000000-0000-4000-8000-000000003813',
    jsonb_build_object('id', 'wrapping', 'name', 'Giấy gói quà'),
    jsonb_build_object('id', 'a2', 'name', 'Khổ A2', 'price', 49000),
    5,
    49000,
    245000,
    245000,
    'VND',
    'Võ Hoàng Nam',
    '0908333444',
    '+84908333444',
    '56 Nguyễn Thị Minh Khai, Phường Đa Kao, Quận 1, TP. Hồ Chí Minh',
    'paid',
    'awaiting_review',
    'unprocessed',
    'seed-order-3803'
  ),
  (
    'e0000000-0000-4000-8000-000000003804',
    'QT3804',
    '00000000-0000-4000-8000-000000003804',
    '00000000-0000-4000-8000-000000003814',
    jsonb_build_object('id', 'notebook', 'name', 'Bìa sổ tay cá nhân hóa'),
    jsonb_build_object('id', 'standard', 'name', 'Khổ A5 tiêu chuẩn', 'price', 49000),
    10,
    49000,
    490000,
    490000,
    'VND',
    'Đặng Thùy Chi',
    '0908444555',
    '+84908444555',
    '78 Pasteur, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    'paid',
    'approved',
    'ready_for_production',
    'seed-order-3804'
  ),
  (
    'e0000000-0000-4000-8000-000000003805',
    'QT3805',
    '00000000-0000-4000-8000-000000003805',
    '00000000-0000-4000-8000-000000003815',
    jsonb_build_object('id', 'card', 'name', 'Thiệp chúc mừng'),
    jsonb_build_object('id', 'horizontal', 'name', 'Thiệp ngang', 'price', 29000),
    5,
    29000,
    145000,
    145000,
    'VND',
    'Bùi Quốc Anh',
    '0908555666',
    '+84908555666',
    '90 Nam Kỳ Khởi Nghĩa, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    'paid',
    'approved',
    'ready_for_production',
    'seed-order-3805'
  ),
  (
    'e0000000-0000-4000-8000-000000003806',
    'QT3806',
    '00000000-0000-4000-8000-000000003806',
    '00000000-0000-4000-8000-000000003816',
    jsonb_build_object('id', 'sticker', 'name', 'Sticker dán theo yêu cầu'),
    jsonb_build_object('id', 'die-cut', 'name', 'Cắt theo hình (Die-cut)', 'price', 19000),
    5,
    19000,
    95000,
    95000,
    'VND',
    'Phan Hoàng Yến',
    '0908666777',
    '+84908666777',
    '102 Điện Biên Phủ, Phường 15, Bình Thạnh, TP. Hồ Chí Minh',
    'paid',
    'approved',
    'in_production',
    'seed-order-3806'
  ),
  (
    'e0000000-0000-4000-8000-000000003807',
    'QT3807',
    '00000000-0000-4000-8000-000000003807',
    '00000000-0000-4000-8000-000000003817',
    jsonb_build_object('id', 'notebook', 'name', 'Bìa sổ tay cá nhân hóa'),
    jsonb_build_object('id', 'standard', 'name', 'Khổ A5 tiêu chuẩn', 'price', 49000),
    4,
    49000,
    196000,
    196000,
    'VND',
    'Đỗ Văn Kiên',
    '0908777888',
    '+84908777888',
    '15 Võ Văn Tần, Phường 6, Quận 3, TP. Hồ Chí Minh',
    'paid',
    'approved',
    'completed',
    'seed-order-3807'
  )
on conflict (id) do update set
  public_order_code = excluded.public_order_code,
  payment_status = excluded.payment_status,
  design_status = excluded.design_status,
  fulfillment_status = excluded.fulfillment_status,
  updated_at = now();

-- Payments
insert into public.order_payments (order_id, provider, amount, currency, reference, status, confirmed_at, customer_reported_at)
values
  ('e0000000-0000-4000-8000-000000003801', 'vietqr', 190000, 'VND', 'VQR-QT3801', 'pending_payment', null, null),
  ('e0000000-0000-4000-8000-000000003802', 'vietqr', 290000, 'VND', 'VQR-QT3802', 'payment_reported', null, now() - interval '1 hour'),
  ('e0000000-0000-4000-8000-000000003803', 'vietqr', 245000, 'VND', 'VQR-QT3803', 'paid', now() - interval '2 hour', now() - interval '3 hour'),
  ('e0000000-0000-4000-8000-000000003804', 'vietqr', 490000, 'VND', 'VQR-QT3804', 'paid', now() - interval '4 hour', now() - interval '5 hour'),
  ('e0000000-0000-4000-8000-000000003805', 'vietqr', 145000, 'VND', 'VQR-QT3805', 'paid', now() - interval '6 hour', now() - interval '7 hour'),
  ('e0000000-0000-4000-8000-000000003806', 'vietqr', 95000, 'VND', 'VQR-QT3806', 'paid', now() - interval '8 hour', now() - interval '9 hour'),
  ('e0000000-0000-4000-8000-000000003807', 'vietqr', 196000, 'VND', 'VQR-QT3807', 'paid', now() - interval '10 hour', now() - interval '11 hour')
on conflict (order_id) do update set
  status = excluded.status,
  amount = excluded.amount,
  reference = excluded.reference,
  confirmed_at = excluded.confirmed_at,
  customer_reported_at = excluded.customer_reported_at,
  updated_at = now();

-- Events
insert into public.order_events (order_id, event_type, actor_role, payload)
values
  ('e0000000-0000-4000-8000-000000003801', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003802', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003802', 'payment_reported', 'customer', jsonb_build_object('ref', 'VQR-QT3802')),
  ('e0000000-0000-4000-8000-000000003803', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003803', 'payment_confirmed', 'admin', jsonb_build_object('amount', 245000)),
  ('e0000000-0000-4000-8000-000000003804', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003804', 'payment_confirmed', 'admin', jsonb_build_object('amount', 490000)),
  ('e0000000-0000-4000-8000-000000003804', 'design_approved', 'staff', jsonb_build_object('note', 'File chuẩn in')),
  ('e0000000-0000-4000-8000-000000003805', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003805', 'payment_confirmed', 'admin', jsonb_build_object('amount', 145000)),
  ('e0000000-0000-4000-8000-000000003806', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003806', 'payment_confirmed', 'admin', jsonb_build_object('amount', 95000)),
  ('e0000000-0000-4000-8000-000000003806', 'production_started', 'staff', jsonb_build_object('batch', 'batch-3806')),
  ('e0000000-0000-4000-8000-000000003807', 'order_created', 'customer', jsonb_build_object('source', 'web_checkout')),
  ('e0000000-0000-4000-8000-000000003807', 'payment_confirmed', 'admin', jsonb_build_object('amount', 196000)),
  ('e0000000-0000-4000-8000-000000003807', 'production_completed', 'staff', jsonb_build_object('batch', 'batch-3807'));

-- Holds (attached only if admin user exists)
do $$
declare
  v_admin_id uuid;
begin
  select user_id into v_admin_id from public.staff_roles where role = 'admin' limit 1;
  if v_admin_id is not null then
    insert into public.order_holds (id, order_id, reason, held_by, held_at)
    values (
      '00000000-0000-4000-8000-000000003855',
      'e0000000-0000-4000-8000-000000003805',
      'Tạm giữ theo yêu cầu kiểm tra kỹ thuật khuôn in',
      v_admin_id,
      now()
    )
    on conflict (id) do nothing;

    insert into public.order_events (order_id, event_type, actor_user_id, actor_role, payload)
    values (
      'e0000000-0000-4000-8000-000000003805',
      'order_held',
      v_admin_id,
      'admin',
      jsonb_build_object('hold_id', '00000000-0000-4000-8000-000000003855'::uuid, 'reason', 'Tạm giữ theo yêu cầu kiểm tra kỹ thuật khuôn in')
    );
  end if;
end;
$$;
