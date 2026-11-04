'use client';

import { useState } from 'react';
import {
  Avatar,
  Badge,
  Btn,
  Cell,
  Head,
  NameCell,
  Readings,
  Row,
  Screen,
  Search,
  Table,
  type Col,
} from '@/components/admin/ui';
import { matchesBooker, type Booker, type Bookers as BookersData } from '@/lib/admin/bookers';

const cols: Col[] = [
  { head: '', w: 36 },
  { head: 'PLAYER', min: 200 },
  { head: 'PLAYED', w: 132 },
  { head: 'LAST PLAYED', w: 112 },
  { head: 'NEXT BOOKING', w: 112 },
  { head: 'PAID', w: 112, align: 'right' },
];

/**
 * Players: everybody who has booked a court or a class, and how often they
 * have actually played. Counted from the bookings, so it fills itself in as
 * the club gets busier — nobody has to add anyone.
 *
 * The members roster (levels, memberships, packs) is one click away; it is
 * still what /renew and online membership payments write to.
 */
export default function Bookers({ initial }: { initial: BookersData }) {
  const [query, setQuery] = useState('');
  const { people, readings } = initial;
  const shown = people.filter((p) => matchesBooker(p, query));

  return (
    <Screen>
      <Head
        title="Players"
        blurb="Everybody who has booked a court or a class, and how many times they have played."
        actions={<Btn href="/admin/players/members">Members roster</Btn>}
      />

      <Readings
        readings={[
          {
            label: 'People',
            value: String(readings.people),
            detail: 'have booked',
          },
          {
            label: 'Sessions played',
            value: String(readings.visits),
            detail: 'courts and classes',
          },
          {
            label: 'Came back',
            value: String(readings.returning),
            detail:
              readings.people > 0
                ? `${Math.round((readings.returning / readings.people) * 100)}% played more than once`
                : 'played more than once',
          },
          {
            label: 'This month',
            value: String(readings.thisMonth),
            detail: `played · ${readings.upcoming} booked ahead`,
          },
        ]}
      />

      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Search placeholder="Search a name or number" width={240} value={query} onChange={setQuery} />
        </div>

        <Table cols={cols}>
          {shown.map((person) => (
            <PersonRow key={person.key} person={person} />
          ))}
        </Table>

        {shown.length === 0 && (
          <p className="py-6 text-[15px] leading-[22px] text-neutral-500">
            {people.length === 0
              ? 'Nobody has booked yet. Everyone who books a court or a class shows up here on their own.'
              : 'Nobody matches that.'}
          </p>
        )}
      </div>
    </Screen>
  );
}

function PersonRow({ person }: { person: Booker }) {
  const phone = person.phone ? person.phone.replace(/^\+255/, '0') : 'no number';
  const split = [
    person.courts > 0 && `${person.courts} court${person.courts === 1 ? '' : 's'}`,
    person.classes > 0 && `${person.classes} class${person.classes === 1 ? '' : 'es'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Row>
      <Cell col={cols[0]}>
        <Avatar initials={person.initials} />
      </Cell>
      <Cell col={cols[1]} className="gap-3">
        <NameCell name={person.name} sub={`${phone} · ${person.since}`} />
        {person.member && <Badge tone="green">MEMBER</Badge>}
      </Cell>
      <Cell col={cols[2]}>
        <span className="flex flex-col gap-0.5">
          <span
            className={`text-[16px] font-semibold leading-5 ${
              person.played > 0 ? 'text-pine' : 'text-neutral-400'
            }`}
          >
            {person.played} {person.played === 1 ? 'time' : 'times'}
          </span>
          <span className="truncate text-[12px] leading-4 text-neutral-500">
            {split || 'first visit booked'}
          </span>
        </span>
      </Cell>
      <Cell col={cols[3]}>
        <span
          className={`text-[13px] leading-4 ${
            person.lastPlayedOn ? 'text-neutral-600' : 'text-neutral-400'
          }`}
        >
          {person.lastPlayed}
        </span>
      </Cell>
      <Cell col={cols[4]}>
        <span
          className={`text-[13px] leading-4 ${
            person.next ? 'font-medium text-pine' : 'text-neutral-400'
          }`}
        >
          {person.next ?? '—'}
        </span>
      </Cell>
      <Cell col={cols[5]}>
        <span className="text-[13px] leading-4 text-neutral-600">{person.spent}</span>
      </Cell>
    </Row>
  );
}
