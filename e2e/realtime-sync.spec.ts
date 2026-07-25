/**
 * E2E Tests — Real-Time Customer Name Sync
 * ──────────────────────────────────────────
 *
 * ⚠️  PREREQUISITES
 * These tests require:
 *   1. A running backend (InsForge/Supabase) with seeded test data
 *   2. A test user account for login (set via TEST_EMAIL / TEST_PASSWORD env vars)
 *   3. Specific table and room IDs that exist in the seeded DB
 *
 * The dev server auto-starts via playwright.config.ts.
 *
 * Without a properly seeded backend, tests will fail. Set the env vars:
 *   TEST_EMAIL=test@example.com TEST_PASSWORD=secret npx playwright test
 *
 * ─── Coverage ───────────────────────────────────────────────
 *   1. POS table mode: customer name sync → Dashboard
 *   2. POS room mode: customer name sync for room batches
 *   3. BookingFormModal: edit guest name → booking + rooms.guest sync
 *   4. BookingFormModal: required field validation
 *   5. Per-table customer name isolation
 */

import { test, expect } from '@playwright/test'

// ─── Test credentials (from env, with fallback for local dev) ─
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'test@pos.local'
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'test-password-123'

// ─── Test data IDs (must exist in the seeded database) ───────
const TEST_TABLE_ID = process.env.TEST_TABLE_ID ?? '00000000-0000-0000-0000-000000000001'
const TEST_ROOM_ID  = process.env.TEST_ROOM_ID  ?? '00000000-0000-0000-0000-000000000002'

// ─── Login helper ─────────────────────────────────────────────

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  // Wait for the login form to render
  await page.waitForSelector('input[type="email"]', { timeout: 10_000 })
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
}

// ─── Tests ───────────────────────────────────────────────────

test.describe('Real-Time Customer Name Sync', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('POS table mode: customer name syncs to Dashboard', async ({ page }) => {
    test.slow() // Allow extra time for DB sync + polling

    // Navigate to POS with a specific table
    await page.goto(`/pos?table=${TEST_TABLE_ID}`)
    // Wait for the POS page to render - look for the customer name input
    await page.waitForSelector('input[placeholder*="e.g."]', { timeout: 10_000 })

    // Type a unique customer name with timestamp to avoid collisions
    const customerName = `E2E Table ${Date.now()}`
    const customerInput = page.locator('input[placeholder*="e.g."]').first()
    await customerInput.fill(customerName)

    // Wait for debounced DB sync (1.5s debounce + network round-trip)
    await page.waitForTimeout(3000)

    // Navigate to Dashboard and verify the table card shows the customer name
    await page.goto('/dashboard')
    await page.waitForSelector('text=E2E Table', { timeout: 15_000 }).catch(() => {
      // Fallback: wait for polling interval and check again
      return page.waitForSelector('text=E2E Table', { timeout: 15_000 })
    })
    await expect(page.locator(`text=${customerName}`).first()).toBeVisible({ timeout: 10_000 })
  })

  test('POS room mode: customer name syncs for room batches', async ({ page }) => {
    test.slow()

    // Navigate to POS with a specific room
    await page.goto(`/pos?room=${TEST_ROOM_ID}`)
    await page.waitForSelector('input[placeholder*="e.g."]', { timeout: 10_000 })

    const roomCustomerName = `E2E Room ${Date.now()}`
    const customerInput = page.locator('input[placeholder*="e.g."]').first()
    await customerInput.fill(roomCustomerName)

    await page.waitForTimeout(3000)

    // Verify on Dashboard — switch to Rooms tab if needed
    await page.goto('/dashboard')
    const roomsTab = page.locator('button:has-text("Rooms")').first()
    if (await roomsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roomsTab.click()
    }

    await expect(page.locator(`text=${roomCustomerName}`).first()).toBeVisible({ timeout: 15_000 })
  })

  test('BookingFormModal: edits guest name and syncs to Dashboard', async ({ page }) => {
    test.slow()

    // Navigate to Operations page
    await page.goto('/operations')
    // Wait for room cards to render
    await page.waitForSelector('[class*="rounded-2xl"]', { timeout: 10_000 })

    // Find and click the "Edit Guest" action from the MoreMenu on an occupied room.
    // The MoreMenu button has aria-label "More actions".
    const moreMenuBtn = page.locator('button[aria-label="More actions"]').first()
    await moreMenuBtn.click()

    // Click "Edit Guest" from the dropdown
    const editGuestBtn = page.locator('text=Edit Guest').first()
    await editGuestBtn.click()

    // Wait for the BookingFormModal to open
    await page.waitForSelector('text=Manage Booking', { timeout: 5_000 })

    // Edit the guest name
    const nameInput = page.locator('input[placeholder*="e.g."]').first()
    await nameInput.clear()
    const updatedName = `E2E Updated ${Date.now()}`
    await nameInput.fill(updatedName)

    // Save
    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator('text=Guest details updated')).toBeVisible({ timeout: 10_000 })

    // Verify on Dashboard
    await page.goto('/dashboard')
    await expect(page.locator(`text=${updatedName}`).first()).toBeVisible({ timeout: 15_000 })
  })

  test('BookingFormModal: validates required fields before saving', async ({ page }) => {
    // Navigate to Operations, open Edit Guest on an occupied room
    await page.goto('/operations')
    await page.waitForSelector('[class*="rounded-2xl"]', { timeout: 10_000 })

    const moreMenuBtn = page.locator('button[aria-label="More actions"]').first()
    await moreMenuBtn.click()
    await page.locator('text=Edit Guest').first().click()
    await page.waitForSelector('text=Manage Booking', { timeout: 5_000 })

    // Clear the guest name
    const nameInput = page.locator('input[placeholder*="e.g."]').first()
    await nameInput.clear()

    // Try to save — should show validation error
    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator('text=Guest name is required')).toBeVisible({ timeout: 5_000 })

    // Fill name back and clear phone
    const phoneInput = page.locator('input[placeholder*="98"]').first()
    await phoneInput.clear()
    await nameInput.fill('Valid Name')

    await page.locator('button:has-text("Save Changes")').click()
    await expect(page.locator('text=Phone number is required')).toBeVisible({ timeout: 5_000 })
  })

  test('per-table customer name isolation', async ({ page }) => {
    // This test verifies that switching between tables preserves
    // independent customer names per table.

    // Navigate to POS
    await page.goto('/pos')
    await page.waitForSelector('input[placeholder*="e.g."]', { timeout: 10_000 })

    // Select Table 1 via URL
    await page.goto(`/pos?table=${TEST_TABLE_ID}`)
    await page.waitForTimeout(1000)

    // Type a unique name
    const table1Name = `Table 1 ${Date.now()}`
    await page.locator('input[placeholder*="e.g."]').first().fill(table1Name)

    // Switch to a different table (use a second test table ID)
    const table2Id = process.env.TEST_TABLE_ID_2 ?? '00000000-0000-0000-0000-000000000003'
    await page.goto(`/pos?table=${table2Id}`)
    await page.waitForTimeout(1000)

    // Table 2's input should NOT show Table 1's name
    const table2Input = page.locator('input[placeholder*="e.g."]').first()
    const table2Value = await table2Input.inputValue()
    expect(table2Value).not.toBe(table1Name)

    // Switch back to Table 1 — should preserve the name
    await page.goto(`/pos?table=${TEST_TABLE_ID}`)
    await page.waitForTimeout(1000)
    const table1Value = await page.locator('input[placeholder*="e.g."]').first().inputValue()
    expect(table1Value).toBe(table1Name)
  })
})
