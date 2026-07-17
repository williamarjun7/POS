#!/usr/bin/env python3
"""Apply the remaining void UI changes to POS.tsx."""
import re

filepath = 'src/pages/POS.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File size: {len(content)} chars")

# 1. Mobile Previous Batches - Replace Ban icon with "Void" text button
# Find the second occurrence (mobile) of voidBatchItem pattern
first_void_idx = content.find('voidBatchItem(batch.id, item.id)')
if first_void_idx >= 0:
    second_void_idx = content.find('voidBatchItem(batch.id, item.id)', first_void_idx + 1)
    if second_void_idx >= 0:
        # Extract the surrounding context to make the replacement
        # Find the button opening tag before this
        btn_start = content.rfind('button', 0, second_void_idx)
        btn_end = content.find('</button>', second_void_idx) + len('</button>')
        
        # Get the full button block 
        block_start = content.rfind('<button', 0, second_void_idx)
        block_end = content.find('</button>', block_start) + len('</button>')
        
        old_btn = content[block_start:block_end]
        
        new_btn = '''<button
                                    onClick={() => setVoidConfirm({ type: 'batch', batchId: batch.id, itemId: item.id, itemName: item.name })}
                                    className="shrink-0 text-[10px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                  >
                                    Void
                                  </button>'''
        
        content = content[:block_start] + new_btn + content[block_end:]
        print(f"Mobile Previous Batches - void button replaced")
    else:
        print("Second voidBatchItem not found")

# 2. Mobile Previous Batches - Update VOID label to VOIDED 
# (only the one in the batch items, not the cart items)
# Find the pattern in the mobile section (after the second Previous Batches)
# We need to find "VOID</span>" in the batch item context
# This is tricky - let's find the last occurrence of "uppercase leading-none\">VOID</span>"
void_label_old = 'uppercase leading-none\">VOID</span>'
# Count how many of these exist
count = content.count(void_label_old)
if count >= 2:
    # Replace the first (desktop) was already done - replace the second (mobile)
    idx1 = content.find(void_label_old)
    idx2 = content.find(void_label_old, idx1 + 1)
    if idx2 >= 0:
        content = content[:idx2] + 'uppercase leading-none\">VOIDED</span>' + content[idx2 + len(void_label_old):]
        print(f"Mobile VOID label updated to VOIDED")

# 3. Mobile Previous Batches - Update strikethrough styling
old_mobile_style = '<span className={`truncate ${isSettled ? \'line-through\' : \'\'}`}>{item.name} × {item.quantity}</span>\n                                </div>\n                                <span className={`tabular-nums ml-2 shrink-0 ${isSettled ? \'line-through\' : \'\'}`}>{npr(item.unit_price * item.quantity)}</span>'
# Find second occurrence
idx1 = content.find(old_mobile_style)
if idx1 >= 0:
    idx2 = content.find(old_mobile_style, idx1 + 1)
    if idx2 >= 0:
        new_mobile_style = '<span className={`truncate ${isSettled ? \'line-through text-muted-foreground/30\' : \'\'}`}>{item.name} × {item.quantity}</span>\n                                </div>\n                                <span className={`tabular-nums ml-2 shrink-0 ${isSettled ? \'line-through text-muted-foreground/30\' : \'\'}`}>{npr(item.unit_price * item.quantity)}</span>'
        content = content[:idx2] + new_mobile_style + content[idx2 + len(old_mobile_style):]
        print(f"Mobile strikethrough styling updated")

# 4. Replace Current Order desktop context menu (MoreVertical) with inline Void
# Find the first context menu (desktop version)
old_desktop_cm = '''<div className="relative" data-context-menu="true">
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setContextMenuItem(contextMenuItem === line.menu_item_id ? null : line.menu_item_id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><MoreVertical className="h-4 w-4" /></motion.button>
                                {contextMenuItem === line.menu_item_id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                    className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-border bg-card shadow-xl shadow-black/10 overflow-hidden"
                                  >
                                    <button onClick={() => { setContextMenuItem(null); removeItem(line.menu_item_id); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left">
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                      Remove
                                    </button>
                                    <div className="border-t border-border my-0.5" />
                                    <button onClick={() => { setContextMenuItem(null); setNewCartItems(prev => prev.map(l => l.menu_item_id === line.menu_item_id ? { ...l, status: 'voided' as const } : l)); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left">
                                      <Ban className="h-3.5 w-3.5" />
                                      Void Item
                                    </button>
                                  </motion.div>
                                )}
                              </div>'''

# First check if it exists (might have been partially modified by earlier changes)
if 'data-context-menu="true"' in content:
    # Get the count
    cm_count = content.count('data-context-menu="true"')
    print(f"Found {cm_count} context menus")
    
    # Build the replacement
    new_inline = '''<div className="flex items-center gap-1">
                                <button
                                  onClick={() => setVoidConfirm({ type: 'cart', menuItemId: line.menu_item_id, itemName: line.name })}
                                  className="shrink-0 text-[11px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                >
                                  Void
                                </button>
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => removeItem(line.menu_item_id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-4 w-4" /></motion.button>
                              </div>'''
    
    # Try exact match first
    if old_desktop_cm in content:
        content = content.replace(old_desktop_cm, new_inline, 1)
        print("Desktop context menu replaced")
    else:
        # Find the first context menu and replace it
        # Find the opening div
        cm_start = content.find('data-context-menu="true"')
        if cm_start >= 0:
            # Find the div that opens it
            div_start = content.rfind('<div', 0, cm_start)
            if div_start >= 0:
                # Find the matching closing </div>
                depth = 0
                cm_end = div_start
                i = div_start
                while i < len(content):
                    if content[i:i+4] == '<div' and content[i+4] != ' ' or (content[i+4] == ' ' and not content[i:i+8].startswith('<div id')):
                        # Check it's not a closing tag
                        if not content[i:i+2] == '</':
                            depth += 1
                    elif content[i:i+6] == '</div>':
                        depth -= 1
                        if depth == 0:
                            cm_end = i + 6
                            break
                    i += 1
                
                if cm_end > div_start:
                    old_block = content[div_start:cm_end]
                    content = content[:div_start] + new_inline + content[cm_end:]
                    print(f"Desktop context menu block replaced (length {len(old_block)})")
    
    # Replace second context menu (mobile)
    cm_count_after = content.count('data-context-menu="true"')
    if cm_count_after > 0:
        # There's still a mobile context menu
        old_mobile_cm = '''<div className="relative" data-context-menu="true">
                            <button onClick={() => setContextMenuItem(contextMenuItem === line.menu_item_id ? null : line.menu_item_id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><MoreVertical className="h-4 w-4" /></button>
                            {contextMenuItem === line.menu_item_id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-border bg-card shadow-xl shadow-black/10 overflow-hidden"
                              >
                                <button onClick={() => { setContextMenuItem(null); removeItem(line.menu_item_id); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left">
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  Remove
                                </button>
                                <div className="border-t border-border my-0.5" />
                                <button onClick={() => { setContextMenuItem(null); setNewCartItems(prev => prev.map(l => l.menu_item_id === line.menu_item_id ? { ...l, status: 'voided' as const } : l)); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left">
                                  <Ban className="h-3.5 w-3.5" />
                                  Void Item
                                </button>
                              </motion.div>
                            )}
                          </div>'''
        
        new_mobile_inline = '''<div className="flex items-center gap-1">
                            <button
                              onClick={() => setVoidConfirm({ type: 'cart', menuItemId: line.menu_item_id, itemName: line.name })}
                              className="shrink-0 text-[11px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                            >
                              Void
                            </button>
                            <button onClick={() => removeItem(line.menu_item_id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-4 w-4" /></button>
                          </div>'''
        
        if old_mobile_cm in content:
            content = content.replace(old_mobile_cm, new_mobile_inline, 1)
            print("Mobile context menu replaced")
        else:
            # Find the remaining context menu
            cm_start = content.find('data-context-menu="true"')
            if cm_start >= 0:
                div_start = content.rfind('<div', 0, cm_start)
                if div_start >= 0:
                    depth = 0
                    cm_end = div_start
                    i = div_start
                    while i < len(content):
                        if content[i:i+4] == '<div' and content[i+4] != ' ':
                            if not content[i:i+2] == '</':
                                depth += 1
                        elif content[i:i+6] == '</div>':
                            depth -= 1
                            if depth == 0:
                                cm_end = i + 6
                                break
                        i += 1
                    
                    if cm_end > div_start:
                        old_block = content[div_start:cm_end]
                        content = content[:div_start] + new_mobile_inline + content[cm_end:]
                        print(f"Mobile context menu block replaced (length {len(old_block)})")
else:
    print("No context menus found, likely already replaced")

# 5. Add ConfirmDialog rendering before </PageTransition>
end_page = content.rfind('</PageTransition>')
if end_page > 0:
    confirm_dialog = '''
      {/* ─── Void confirmation dialog ─── */}
      <ConfirmDialog
        open={voidConfirm !== null}
        title="Void Item"
        message={voidConfirm ? `Are you sure you want to void "${voidConfirm.itemName}"?` : ''}
        confirmLabel="Void Item"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (!voidConfirm) return;
          if (voidConfirm.type === 'batch') {
            voidBatchItem(voidConfirm.batchId, voidConfirm.itemId);
          } else {
            voidCartItem(voidConfirm.menuItemId);
          }
          setVoidConfirm(null);
        }}
        onCancel={() => setVoidConfirm(null)}
      />
'''
    content = content[:end_page] + confirm_dialog + content[end_page:]
    print("ConfirmDialog added before </PageTransition>")
else:
    print("Could not find </PageTransition>")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✅ All changes applied!")
