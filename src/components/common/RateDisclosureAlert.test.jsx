import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getRateDisclosure,
  rateDisclosureContent,
  rateSourceKinds
} from '../../services/rateDisclosureService.js';
import RateDisclosureAlert from './RateDisclosureAlert.jsx';

describe('RateDisclosureAlert', () => {
  it('renders nothing without a disclosure', () => {
    const { container } = render(<RateDisclosureAlert disclosure={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the demo wording as a labelled note that is not color-only', () => {
    render(<RateDisclosureAlert disclosure={getRateDisclosure(null)} />);

    const note = screen.getByRole('note', { name: rateDisclosureContent.demo.title });

    expect(note).toBeVisible();
    expect(note).toHaveAttribute('data-rate-source', rateSourceKinds.demo);
    // Title and text carry the meaning, so it does not depend on color.
    expect(note).toHaveTextContent(rateDisclosureContent.demo.title);
    expect(note).toHaveTextContent(rateDisclosureContent.demo.message);
    // The warning icon is decorative for assistive technology.
    expect(note.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the neutral wording for a custom source', () => {
    render(<RateDisclosureAlert disclosure={getRateDisclosure('https://example.com/r.json')} />);

    const note = screen.getByRole('note');

    expect(note).toHaveAttribute('data-rate-source', rateSourceKinds.unverified);
    expect(note).toHaveTextContent(rateDisclosureContent.unverified.title);
    expect(note).not.toHaveTextContent(rateDisclosureContent.demo.title);
  });

  it('can show the longer Settings explanation instead', () => {
    render(<RateDisclosureAlert detail disclosure={getRateDisclosure(null)} />);

    expect(screen.getByRole('note')).toHaveTextContent(rateDisclosureContent.demo.settingsDetail);
  });
});
