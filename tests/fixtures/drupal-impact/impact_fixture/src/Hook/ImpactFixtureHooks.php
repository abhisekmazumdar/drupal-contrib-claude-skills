<?php

namespace Drupal\impact_fixture\Hook;

use Drupal\Core\Hook\Attribute\Hook;

/**
 * OOP hook implementations for the impact fixture.
 */
class ImpactFixtureHooks {

  /**
   * Implements hook_page_attachments().
   */
  #[Hook('page_attachments')]
  public function pageAttachments(array &$attachments): void {
    $attachments['#attached']['library'][] = 'impact_fixture/greeting';
  }

}
