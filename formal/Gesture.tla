------------------------------- MODULE Gesture -------------------------------
EXTENDS Naturals, RuntimeTables
Kinds == {"piece","cover-move","orbit","ink","turn","cover-turn","press","scroll","place","lid","straw","slider"}
Surfaces == {"canvas","handle","shelf","drink","slider"}
Events == {"pointerup","pointercancel","lostpointercapture","pointermove"}
Ids == {1,2}
VARIABLES kind, finger, correct
vars == <<kind, finger, correct>>
Init == /\ kind = "idle" /\ finger = 0 /\ correct = TRUE
Begin(k,i) == /\ kind = "idle" /\ kind' = k /\ finger' = i /\ UNCHANGED correct
End(s,i,e) ==
  LET result == PointerResult(kind,s,i=finger,e)
      surface == CASE kind \in {"turn","cover-turn"} -> "handle"
                   [] kind \in {"press","scroll","place"} -> "shelf"
                   [] kind \in {"lid","straw"} -> "drink"
                   [] kind = "slider" -> "slider"
                   [] OTHER -> "canvas"
      terminal == kind # "idle" /\ i = finger /\ surface = s /\ e # "pointermove"
      wanted == IF ~terminal THEN "ignore" ELSE IF e = "pointerup" THEN "commit" ELSE "cancel"
  IN /\ correct' = (correct /\ result = wanted)
     /\ IF result = "ignore" THEN UNCHANGED <<kind,finger>> ELSE /\ kind' = "idle" /\ finger' = 0
Next == (\E k \in Kinds, i \in Ids : Begin(k,i)) \/ (\E s \in Surfaces, i \in Ids, e \in Events : End(s,i,e))
Spec == Init /\ [][Next]_vars
Ownership == correct /\ (kind = "idle" <=> finger = 0)
=============================================================================
