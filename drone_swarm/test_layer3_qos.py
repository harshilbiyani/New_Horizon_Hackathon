import unittest
from crypto_qos import AdaptiveQoSQueue, QoSPacket, BANDWIDTH_LOW_KBPS, BANDWIDTH_CRITICAL_KBPS


class TestLayer3QoS(unittest.TestCase):

    def _make_packet(self, priority: str, node_id: int = 1) -> QoSPacket:
        return QoSPacket(priority=priority, payload={"data": "test"}, node_id=node_id)

    def test_priority_ordering(self):
        """P1 must be dequeued before P2, P3, P4 regardless of insertion order."""
        q = AdaptiveQoSQueue()
        q.enqueue(self._make_packet("P4_LOGS"))
        q.enqueue(self._make_packet("P2_POSITION"))
        q.enqueue(self._make_packet("P1_EMERGENCY"))
        q.enqueue(self._make_packet("P3_HEALTH"))

        first = q.dequeue()
        self.assertEqual(first.priority, "P1_EMERGENCY")

    def test_p1_never_dropped(self):
        """CRITICAL: P1_EMERGENCY packets must survive even critical bandwidth."""
        q = AdaptiveQoSQueue()
        q.enqueue(self._make_packet("P1_EMERGENCY"))
        q.set_bandwidth(BANDWIDTH_CRITICAL_KBPS - 1)  # Below critical threshold
        packet = q.dequeue()
        self.assertIsNotNone(packet)
        self.assertEqual(packet.priority, "P1_EMERGENCY")

    def test_p4_dropped_on_low_bandwidth(self):
        """P4 logs must be purged when bandwidth drops below LOW threshold."""
        q = AdaptiveQoSQueue()
        q.enqueue(self._make_packet("P4_LOGS"))
        q.enqueue(self._make_packet("P4_LOGS"))
        q.set_bandwidth(BANDWIDTH_LOW_KBPS - 1)
        packet = q.dequeue()   # Nothing should remain
        self.assertIsNone(packet)

    def test_p3_p4_dropped_on_critical_bandwidth(self):
        """P3 health + P4 logs must both be purged at critical bandwidth."""
        q = AdaptiveQoSQueue()
        q.enqueue(self._make_packet("P3_HEALTH"))
        q.enqueue(self._make_packet("P4_LOGS"))
        q.set_bandwidth(BANDWIDTH_CRITICAL_KBPS - 1)
        packet = q.dequeue()
        self.assertIsNone(packet)
        self.assertEqual(q.total_dropped, 2)


if __name__ == '__main__':
    unittest.main()
